// ひまつぶし工房：ランキングの送信と取得 KoboRank（P1-6。SYSTEM_ARCHITECTURE.md 7章）
// ---------------------------------------------------------------------------------
// 読み込み：</body> の前で firebase-config.js → common/cloud.js → common/rank.js（games.js・platform.js は <head>）。
//           どれがなくても例外は出さない（送信も取得もしないで、失敗を返すだけ）。node のテストでは require() できる。
//
// データ（Firestore。ルールは firestore.rules の kbBoards）：
//   kbBoards/{game}~all/e/{uid}            通算
//   kbBoards/{game}~w{週番号}/e/{uid}       週間（日本時間の月曜0時に切り替わる。KoboPlatform.jstWeekKey）
//   kbBoards/{game}~d{YYYYMMDD}/e/{uid}     日間（日本時間。KoboPlatform.jstDateKey）
//   1件 = { u: uid, n: ニックネーム, s: 値（整数・大きいほど良い）, t: サーバーの時刻, m?: { dur } }
//
// 送る：KoboRank.submit(game, value, { periods, durationMs }) / submitBests() / schedule()
//   - そのボードで、この端末から前に送った値（kobo.rankSent）を超えたときだけ書く。1回で最大3件（all / w / d）。
//   - 週間と日間は、キャッシュにある30位（30件そろっているとき）に届かなければ書かない。通算は必ず書く。
//   - 同じボードへの書き込みは6秒以上あける（ルールは5秒）。1つの端末で1日に書くのは最大 DAY_WRITES 件。
//   - submitBests()：登録簿の rankSource（KoboPlatform.rankValue）を読み、
//       初めて（移行）→ 通算だけ送る／前に見た値より増えた → 通算・週間・日間に送る。
//   - プレイの終わり（KoboPlatform の 'played'、mode が normal/daily）：点数のゲーム（score.fmt がないもの）は、
//       そのプレイの点を週間・日間・通算に送る（durationMs があれば m.dur に入れる）。
//   - 送る前の確認（check）：整数で 0 < 値 ≤ cap、maxRate があれば 値/秒 ≤ maxRate。だめなら送らず kobo.rankRejected に残す。
//   - 名前は kobo.nick。ニックネームがなければ送らない。ログインしていなければ KoboCloud.ensureGuest()（匿名）。
//   - ルールがまだ公開されていない（permission-denied）ときは、6時間は送らない（kobo.rankRules）。
//   - 自動：rankSource のキーが localStorage に書かれたら schedule()（setItem を包む。cloud.js が取り込んだ値も）。
//       ページを開いたとき、ログイン中（Google か、前に作ったゲスト）でニックネームがあれば1回 schedule()。
//   - ニックネームを変えても、ボードの名前は次に記録が増えたときに変わる（ルールが「増えるときだけ更新」のため）。
//
// 読む：KoboRank.top(game, period) → { rows, board, at, cached, reads, error }
//   - orderBy('s','desc').limit(30)。結果は kobo.rankCache に5分（1回の表示で読むのは最大31件）。
//   - rows[i] = { uid, n, s, t, dur, rank, out }。out は外れ値の理由（灰色にして順位から外す）。同点は同じ順位。
//   KoboRank.overall() → 今週の XP（kbProfiles.xpw）の上位30件（P3-1 が書くまでは空）。hasOverall() は1件だけ読んで確かめる。
//   KoboRank.legacy.game(id) / legacy.overall()：旧ランキング kusogeRanks（ゲーム別は30件、総合は最大1000件を1日キャッシュ）。
//   error.code === 'permission-denied' のとき、新しいルールがまだ公開されていない（10分は読みに行かない）。
//
// 端末に置くもの（localStorage）：kobo.rankSent { uid, b: { board: 値 }, base: { game: 値 }, day: { k, n } }、
//   kobo.rankCache、kobo.rankLegacyCache、kobo.rankRules { off: 時刻 }、kobo.rankRejected（最新20件）。
(function (root) {
  'use strict';

  var VERSION = 1;
  var DAY = 86400000, JST = 9 * 3600000;
  var TOP = 30;
  var CACHE_MS = 5 * 60000, LEGACY_ALL_MS = DAY, CACHE_MAX = 40;
  var RULES_READ_BACKOFF = 10 * 60000, RULES_WRITE_BACKOFF = 6 * 3600000;
  var SAME_BOARD_MS = 6000, DAY_WRITES = 40;
  var DEBOUNCE = 3000, MIN_GAP = 60000;
  // 旧ランキング kusogeRanks への書き込みが止まる時刻（firestore.rules の legacyOpen()：2026-12-02 0:00 日本時間）
  var LEGACY_END = Date.UTC(2026, 11, 1, 15, 0, 0);
  var KEYS = { sent: 'kobo.rankSent', cache: 'kobo.rankCache', legacy: 'kobo.rankLegacyCache', rules: 'kobo.rankRules', rejected: 'kobo.rankRejected', nick: 'kobo.nick' };
  var PERIODS = ['all', 'week', 'day'];

  // ------------------------------------------------------------------ 環境（テストで差し替えられる）
  var env = {
    now: function () { return Date.now(); },
    storage: function () { try { return root.localStorage || null; } catch (e) { return null; } },
    cloud: function () { return root.KoboCloud || null; },
    // Firestore（compat）。KoboCloud.ready() のあとに firebase.firestore()
    db: function () {
      var C = env.cloud();
      if (!C || !C.ready) return Promise.resolve(null);
      return Promise.resolve(C.ready()).then(function (ok) {
        if (!ok || !root.firebase || !root.firebase.firestore) return null;
        try { return root.firebase.firestore(); } catch (e) { return null; }
      }, function () { return null; });
    },
    serverTime: function () { try { return root.firebase.firestore.FieldValue.serverTimestamp(); } catch (e) { return null; } },
  };
  var mem = {};
  function ls() { return env.storage(); }
  function getJSON(k, d) {
    var s = null, st = ls();
    try { s = st ? st.getItem(k) : mem[k]; } catch (e) { s = mem[k]; }
    if (s == null) return d;
    try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; }
  }
  function setJSON(k, v) {
    var s = JSON.stringify(v), st = ls();
    try { if (st) st.setItem(k, s); else mem[k] = s; } catch (e) { mem[k] = s; }
  }
  function now() { return env.now(); }
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };

  // ------------------------------------------------------------------ 日付とボード
  function P() { return root.KoboPlatform || null; }
  function dayKey(ms) {
    var p = P(); if (p && p.jstDateKey) return p.jstDateKey(ms);
    var d = new Date(ms + JST); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  function weekKey(ms) {
    var p = P(); if (p && p.jstWeekKey) return p.jstWeekKey(ms);
    return Math.floor((ms + JST + 3 * DAY) / (7 * DAY));
  }
  function periodKey(period, ms) {
    ms = ms == null ? now() : ms;
    return period === 'all' ? 'all' : period === 'week' ? 'w' + weekKey(ms) : period === 'day' ? 'd' + dayKey(ms) : null;
  }
  function board(game, period, ms) { var k = periodKey(period, ms); return k ? game + '~' + k : null; }
  function boards(game, ms) { return { all: board(game, 'all', ms), week: board(game, 'week', ms), day: board(game, 'day', ms) }; }
  // 週の範囲（日本時間の月曜〜日曜）を YYYYMMDD で
  function weekRange(ms) {
    ms = ms == null ? now() : ms;
    var w = weekKey(ms), start = w * 7 * DAY - 3 * DAY - JST;
    return { week: w, from: dayKey(start), to: dayKey(start + 6 * DAY), endsAt: start + 7 * DAY };
  }

  // ------------------------------------------------------------------ 登録簿
  function reg() { return root.KOBO_REGISTRY || null; }
  function game(id) { var r = reg(); return r ? r.byId(id) : null; }
  function rankGames() {
    var r = reg(); if (!r) return [];
    return r.games.filter(function (g) { return g.rankSource && !(g.flags && g.flags.ranking === false); });
  }
  function cap(id) { var g = game(id); return g && g.score && g.score.cap > 0 ? g.score.cap : Infinity; }
  function maxRate(id) { var g = game(id); return g && g.score && g.score.maxRate > 0 ? g.score.maxRate : null; }
  // 1回のプレイの点を、そのまま順位の値として送れるゲーム（点数・日数。ステージ制は表示の形 fmt を持つ）
  function perPlay(id) { var g = game(id); return !!(g && g.score && !g.score.fmt); }

  // ------------------------------------------------------------------ 送る前の確認（7.3 の2）
  function check(id, value, opt) {
    opt = opt || {};
    var g = game(id);
    if (!g) return { ok: false, reason: 'game' };
    if (g.flags && g.flags.ranking === false) return { ok: false, reason: 'game' };
    var v = Number(value);
    if (!isFinite(v)) return { ok: false, reason: 'nan' };
    v = Math.floor(v);
    if (v <= 0) return { ok: false, reason: 'zero' };
    if (v > cap(id)) return { ok: false, reason: 'cap' };
    var rate = maxRate(id);
    if (opt.durationMs != null) {
      var dur = Number(opt.durationMs);
      if (!isFinite(dur) || dur < 0) return { ok: false, reason: 'dur' };
      if (rate && v / Math.max(1, dur / 1000) > rate) return { ok: false, reason: 'rate' };
    }
    if (opt.mode && opt.mode !== 'normal' && opt.mode !== 'daily') return { ok: false, reason: 'mode' };
    return { ok: true, value: v };
  }
  function reject(id, value, reason) {
    var a = getJSON(KEYS.rejected, []); if (!Array.isArray(a)) a = [];
    a.push({ g: id, v: value, why: reason, at: now() });
    setJSON(KEYS.rejected, a.slice(-20));
  }

  // ------------------------------------------------------------------ 外れ値（見る側。7.3 の4）
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  // rows: [{ s, dur? }] → 同じ配列に out（理由 | null）と rank（外れ値は null）を付ける。s の大きい順に並べ直す
  function flag(rows, id) {
    var c = cap(id), rate = maxRate(id);
    rows.sort(function (a, b) { return b.s - a.s || (a.t || 0) - (b.t || 0); });
    var top = rows.slice(0, 10).map(function (r) { return r.s; }), med = median(top);
    rows.forEach(function (r) {
      r.out = null;
      if (!(r.s > 0) || Math.floor(r.s) !== r.s) r.out = 'value';
      else if (r.s > c) r.out = 'cap';
      else if (rate && r.dur > 0 && r.s / (r.dur / 1000) > rate) r.out = 'rate';
      else if (top.length >= 3 && med > 0 && r.s > 20 * med) r.out = 'median';
    });
    var n = 0, prev = null, prevRank = 0;
    rows.forEach(function (r) {
      if (r.out) { r.rank = null; return; }
      n++;
      r.rank = (prev !== null && r.s === prev) ? prevRank : n;
      prev = r.s; prevRank = r.rank;
    });
    return rows;
  }

  // ------------------------------------------------------------------ 記録（送った値）
  function sentState(uid) {
    var s = getJSON(KEYS.sent, null);
    if (!isObj(s)) s = {};
    if (!isObj(s.b)) s.b = {};
    if (!isObj(s.base)) s.base = {};
    if (!isObj(s.day)) s.day = { k: 0, n: 0 };
    if (uid && s.uid !== uid) { s.uid = uid; s.b = {}; } // ほかのアカウント：そのアカウントのボードの中身はわからない
    // 古い週・日のボードは消す
    var w = 'w' + weekKey(now()), d = 'd' + dayKey(now());
    Object.keys(s.b).forEach(function (k) {
      var p = k.split('~')[1] || '';
      if ((p[0] === 'w' && p !== w) || (p[0] === 'd' && p !== d)) delete s.b[k];
    });
    return s;
  }
  function saveSent(s) { setJSON(KEYS.sent, s); }
  function sentValue(b) { var s = getJSON(KEYS.sent, null); return s && isObj(s.b) && s.b[b] > 0 ? s.b[b] : 0; }

  // ------------------------------------------------------------------ ルールが公開されているか
  function rulesOff(ms) { var r = getJSON(KEYS.rules, null); return !!(r && r.off && now() - r.off < ms && now() >= r.off); }
  function markRules(off) { setJSON(KEYS.rules, off ? { off: now() } : { ok: now() }); }
  var denied = function (e) { return !!e && (e.code === 'permission-denied' || /permission/i.test(String(e.code || e.message || ''))); };

  // ------------------------------------------------------------------ キャッシュ
  function cacheGet(key, ttl) {
    var c = getJSON(KEYS.cache, {}); var e = isObj(c) ? c[key] : null;
    if (!e || !(now() - e.at < ttl) || now() < e.at) return null;
    return e;
  }
  function cachePut(key, rows, extra) {
    var c = getJSON(KEYS.cache, {}); if (!isObj(c)) c = {};
    c[key] = Object.assign({ at: now(), rows: rows.map(packRow) }, extra || {});
    var ks = Object.keys(c);
    if (ks.length > CACHE_MAX) ks.sort(function (a, b) { return c[a].at - c[b].at; }).slice(0, ks.length - CACHE_MAX).forEach(function (k) { delete c[k]; });
    // 期限の切れたものは消す
    Object.keys(c).forEach(function (k) { if (now() - c[k].at > LEGACY_ALL_MS) delete c[k]; });
    setJSON(KEYS.cache, c);
  }
  function packRow(r) { return [r.uid, r.n, r.s, r.t || 0, r.dur || 0]; }
  function unpackRow(a) { return { uid: a[0], n: a[1], s: a[2], t: a[3], dur: a[4] }; }
  // 自分が送った値を、キャッシュした一覧に入れる（読み直さなくても、自分の行が見える）
  function cacheMine(b, uid, nick, v) {
    var c = getJSON(KEYS.cache, {}); var e = isObj(c) ? c['b:' + b] : null; if (!e) return;
    var rows = e.rows.map(unpackRow).filter(function (r) { return r.uid !== uid; });
    rows.push({ uid: uid, n: nick, s: v, t: now(), dur: 0 });
    rows.sort(function (x, y) { return y.s - x.s; });
    e.rows = rows.slice(0, TOP).map(packRow); e.full = e.full || rows.length > TOP;
    setJSON(KEYS.cache, c);
  }
  function cutoff(b) {
    var e = cacheGet('b:' + b, CACHE_MS);
    if (!e || !e.full || e.rows.length < TOP) return 0;
    return e.rows[TOP - 1][2];
  }

  // ------------------------------------------------------------------ 数える（テストで読む）
  var stats = { reads: 0, writes: 0, queries: 0, gets: 0, denied: 0 };
  function countSnap(snap) { stats.queries++; var n = snap && snap.size ? snap.size : (snap && snap.docs ? snap.docs.length : 0); stats.reads += Math.max(1, n); return Math.max(1, n); }

  // ------------------------------------------------------------------ 送る
  function nick() {
    var n = null, st = ls();
    try { n = st ? st.getItem(KEYS.nick) : mem[KEYS.nick]; } catch (e) {}
    if (n && n[0] === '"') { try { n = JSON.parse(n); } catch (e) {} } // cloud.js は文字列のまま、platform.js の store は JSON で書く
    return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  }
  function whoAmI(create) {
    var C = env.cloud(); if (!C) return Promise.resolve(null);
    var u = C.user ? C.user() : (C.me && C.me() ? { uid: C.me() } : null);
    if (u && u.uid) return Promise.resolve(u);
    if (!create || !C.ensureGuest) return Promise.resolve(null);
    return Promise.resolve(C.ensureGuest()).then(function (x) { return x && x.uid ? x : null; }, function () { return null; });
  }
  var chain = Promise.resolve();
  var lastWrite = {}; // board → 時刻
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // value をそのゲームの periods のボードに送る。→ Promise<{ ok, reason?, wrote: [board], skipped: { board: 理由 } }>
  function submit(id, value, opt) {
    opt = opt || {};
    var c = check(id, value, opt);
    if (!c.ok) { if (c.reason !== 'game' && c.reason !== 'zero' && c.reason !== 'mode') reject(id, value, c.reason); return Promise.resolve({ ok: false, reason: c.reason, wrote: [], skipped: {} }); }
    var p = chain.then(function () { return doSubmit(id, c.value, opt); });
    chain = p.catch(function () {});
    return p;
  }
  function doSubmit(id, v, opt) {
    var res = { ok: true, wrote: [], skipped: {} };
    var n = nick();
    if (!n) return Promise.resolve(Object.assign(res, { ok: false, reason: 'nick' }));
    if (rulesOff(RULES_WRITE_BACKOFF)) return Promise.resolve(Object.assign(res, { ok: false, reason: 'rules' }));
    var periods = (opt.periods || PERIODS).filter(function (x) { return PERIODS.indexOf(x) >= 0; });
    return whoAmI(true).then(function (u) {
      if (!u) return Object.assign(res, { ok: false, reason: 'auth' });
      return env.db().then(function (db) {
        if (!db) return Object.assign(res, { ok: false, reason: 'offline' });
        var t = now(), todo = [];
        var s = sentState(u.uid);
        periods.forEach(function (per) {
          var b = board(id, per, t);
          if ((s.b[b] || 0) >= v) { res.skipped[b] = 'sent'; return; }
          if (per !== 'all') { var cut = cutoff(b); if (cut && v <= cut) { res.skipped[b] = 'cutoff'; return; } }
          todo.push(b);
        });
        saveSent(s);
        var step = Promise.resolve();
        todo.forEach(function (b) {
          step = step.then(function () {
            if (res.reason === 'rules') { res.skipped[b] = 'rules'; return; }
            var st = sentState(u.uid), dk = dayKey(now());
            if (st.day.k !== dk) st.day = { k: dk, n: 0 };
            if (st.day.n >= DAY_WRITES) { res.skipped[b] = 'budget'; return; }
            var gap = Math.min(SAME_BOARD_MS, (lastWrite[b] || 0) + SAME_BOARD_MS - now()); // 時計が戻っても待ちすぎない
            return (gap > 0 ? wait(gap) : Promise.resolve()).then(function () { return write(db, b, u.uid, n, v, opt, res); });
          });
        });
        return step.then(function () { if (res.wrote.length === 0 && todo.length && res.reason) res.ok = false; return res; });
      });
    });
  }
  function entryRef(db, b, uid) { return db.collection('kbBoards').doc(b).collection('e').doc(uid); }
  function write(db, b, uid, n, v, opt, res, retried) {
    var doc = { u: uid, n: n, s: v, t: env.serverTime() };
    if (opt.durationMs != null && isFinite(opt.durationMs)) doc.m = { dur: Math.max(0, Math.round(opt.durationMs)) };
    lastWrite[b] = now();
    var st = sentState(uid), dk = dayKey(now());
    if (st.day.k !== dk) st.day = { k: dk, n: 0 };
    st.day.n++; saveSent(st);
    stats.writes++;
    return Promise.resolve(entryRef(db, b, uid).set(doc)).then(function () {
      var s2 = sentState(uid); s2.b[b] = v; saveSent(s2);
      markRules(false);
      cacheMine(b, uid, n, v);
      res.wrote.push(b);
    }, function (e) {
      if (!denied(e)) { res.skipped[b] = 'error'; res.reason = res.reason || 'error'; return; }
      stats.denied++;
      // 拒否：ルールがまだないのか、値が前より低い（ほかの端末が先に送った）のかを、1件だけ読んで見分ける
      stats.gets++; stats.reads++;
      return Promise.resolve(entryRef(db, b, uid).get()).then(function (d) {
        var cur = d && d.exists ? Number((d.data() || {}).s) || 0 : 0;
        markRules(false);
        // 前の書き込みから5秒たっていなかった（ページを開き直した直後など）：1回だけ待ってやり直す
        if (d && d.exists && cur < v && !retried) {
          return wait(SAME_BOARD_MS).then(function () { return write(db, b, uid, n, v, opt, res, true); });
        }
        var s2 = sentState(uid); s2.b[b] = Math.max(v, cur); saveSent(s2); // 同じ値で何度も試さない
        res.skipped[b] = cur >= v ? 'lower' : 'denied';
        if (!(cur >= v)) reject(b.split('~')[0], v, 'denied:' + b);
      }, function (e2) {
        if (denied(e2)) { markRules(true); res.reason = 'rules'; res.skipped[b] = 'rules'; }
        else { res.skipped[b] = 'error'; res.reason = res.reason || 'error'; }
      });
    });
  }

  // 登録簿の値（ハブやゲームの保存）から、増えたものを送る
  function submitBests() {
    var P_ = P();
    if (!P_ || !P_.rankValue || !reg()) return Promise.resolve([]);
    if (!nick() || rulesOff(RULES_WRITE_BACKOFF)) return Promise.resolve([]);
    var out = [];
    var step = Promise.resolve();
    rankGames().forEach(function (g) {
      step = step.then(function () {
        var v = 0; try { v = P_.rankValue(g.id); } catch (e) {}
        if (!(v > 0)) return;
        if (v > cap(g.id)) { reject(g.id, v, 'cap'); return; }
        var s = getJSON(KEYS.sent, null), base = s && isObj(s.base) ? s.base[g.id] : undefined;
        var periods = base == null ? ['all'] : v > base ? PERIODS : ['all'];
        return submit(g.id, v, { periods: periods }).then(function (r) {
          out.push({ game: g.id, value: v, periods: periods, res: r });
          // ルールがない・通信できないときは「増えた」ことを覚えておき、次に送る
          if (r.reason === 'rules' || r.reason === 'offline' || r.reason === 'auth' || r.reason === 'error') return;
          var s2 = sentState(); s2.base[g.id] = Math.max(v, s2.base[g.id] || 0); saveSent(s2);
        });
      });
    });
    return step.then(function () { return out; });
  }
  // 保存が変わったときに呼ぶ（cloud.js から）。3秒待ってまとめ、前の送信から60秒以上あける
  var timer = 0, lastFlush = -Infinity, flushAt = 0;
  function schedule() {
    var t = now(), at = Math.max(t + DEBOUNCE, lastFlush + MIN_GAP);
    if (timer && flushAt <= at) return;
    if (timer) clearTimeout(timer);
    flushAt = at;
    timer = setTimeout(function () { timer = 0; lastFlush = now(); submitBests().catch(function () {}); }, at - t);
  }

  // ------------------------------------------------------------------ 読む
  function err(code) { var e = new Error(code); e.code = code; return e; }
  function readOk(key, ttl, fetch, opt) {
    opt = opt || {};
    var hit = opt.fresh ? null : cacheGet(key, ttl);
    if (hit) return Promise.resolve({ rows: hit.rows.map(unpackRow), at: hit.at, cached: true, reads: 0, extra: hit });
    if (rulesOff(RULES_READ_BACKOFF) && !opt.legacy) return Promise.resolve({ rows: [], error: err('permission-denied'), reads: 0 });
    return env.db().then(function (db) {
      if (!db) return { rows: [], error: err('unavailable'), reads: 0 };
      return fetch(db).then(function (r) {
        if (!opt.legacy) markRules(false);
        cachePut(key, r.rows, r.extra);
        return { rows: r.rows, at: now(), cached: false, reads: r.reads, extra: r.extra };
      }, function (e) {
        if (denied(e) && !opt.legacy) markRules(true);
        return { rows: [], error: e, reads: 1 };
      });
    });
  }
  function top(id, period, opt) {
    var b = board(id, period, opt && opt.at);
    if (!b || !game(id)) return Promise.resolve({ rows: [], board: b, error: err('game'), reads: 0 });
    return readOk('b:' + b, CACHE_MS, function (db) {
      return Promise.resolve(db.collection('kbBoards').doc(b).collection('e').orderBy('s', 'desc').limit(TOP).get()).then(function (snap) {
        var reads = countSnap(snap), rows = [];
        snap.docs.forEach(function (d) {
          var x = d.data() || {};
          var t = x.t && x.t.toMillis ? x.t.toMillis() : (typeof x.t === 'number' ? x.t : 0);
          rows.push({ uid: d.id, n: typeof x.n === 'string' ? x.n : '', s: Number(x.s), t: t, dur: x.m && x.m.dur > 0 ? Number(x.m.dur) : 0 });
        });
        return { rows: rows, reads: reads, extra: { full: rows.length >= TOP } };
      });
    }, opt).then(function (r) { r.board = b; r.rows = flag(r.rows, id); return r; });
  }
  // 今週の XP の上位（kbProfiles。P3-1 が書く）。今週ではない行は外す
  function overall(opt) {
    var wk = weekKey(now());
    return readOk('p:w' + wk, CACHE_MS, function (db) {
      return Promise.resolve(db.collection('kbProfiles').orderBy('xpw', 'desc').limit(TOP).get()).then(function (snap) {
        var reads = countSnap(snap), rows = [];
        snap.docs.forEach(function (d) { var x = d.data() || {}; if (x.wk === wk && x.xpw > 0) rows.push({ uid: d.id, n: String(x.n || ''), s: Number(x.xpw), t: 0, dur: 0 }); });
        return { rows: rows, reads: reads };
      });
    }, opt).then(function (r) {
      r.rows.sort(function (a, b) { return b.s - a.s; });
      var n = 0, prev = null, pr = 0;
      r.rows.forEach(function (x) { n++; x.rank = prev === x.s ? pr : n; prev = x.s; pr = x.rank; x.out = null; });
      return r;
    });
  }
  // 今週の XP の行が1件でもあるか（1件だけ読む。5分キャッシュ）
  function hasOverall(opt) {
    var wk = weekKey(now());
    return readOk('h:w' + wk, CACHE_MS, function (db) {
      return Promise.resolve(db.collection('kbProfiles').where('wk', '==', wk).limit(1).get()).then(function (snap) {
        var reads = countSnap(snap);
        return { rows: snap.docs.map(function (d) { return { uid: d.id, n: '', s: 1, t: 0, dur: 0 }; }), reads: reads };
      });
    }, opt).then(function (r) { return !r.error && r.rows.length > 0; });
  }

  // ------------------------------------------------------------------ 旧ランキング（kusogeRanks）
  function legacyRow(d) {
    var x = d.data() || {};
    var t = x.updatedAt && x.updatedAt.toMillis ? x.updatedAt.toMillis() : Number(x.updatedAt) || 0;
    return { uid: d.id, n: typeof x.name === 'string' ? x.name : '', scores: isObj(x.scores) ? x.scores : {}, t: t };
  }
  var legacy = {
    open: function (ms) { return (ms == null ? now() : ms) < LEGACY_END; },
    END: LEGACY_END,
    // ゲーム別：scores.<id> の大きい順に30件（読み取り30件）。並べられないときは全部読む方へ
    game: function (id, opt) {
      if (!game(id)) return Promise.resolve({ rows: [], error: err('game'), reads: 0 });
      return readOk('l:' + id, CACHE_MS, function (db) {
        return Promise.resolve(db.collection('kusogeRanks').orderBy('scores.' + id, 'desc').limit(TOP).get()).then(function (snap) {
          var reads = countSnap(snap);
          return { rows: snap.docs.map(legacyRow).map(function (r) { return { uid: r.uid, n: r.n, s: Number(r.scores[id]), t: r.t, dur: 0 }; }), reads: reads };
        });
      }, Object.assign({ legacy: true }, opt)).then(function (r) {
        if (r.error && r.error.code === 'failed-precondition') {
          return legacy.all(opt).then(function (a) { return { rows: flag(legacyGame(a.rows, id).slice(0, TOP), id), reads: a.reads, cached: a.cached, error: a.error, at: a.at }; });
        }
        r.rows = flag(r.rows.filter(function (x) { return x.s > 0; }), id); return r;
      });
    },
    // 全部（最大1000件）。1日キャッシュ（kobo.rankLegacyCache）
    all: function (opt) {
      opt = opt || {};
      var c = getJSON(KEYS.legacy, null);
      if (!opt.fresh && c && Array.isArray(c.rows) && now() - c.at < LEGACY_ALL_MS && now() >= c.at) {
        return Promise.resolve({ rows: c.rows.map(function (a) { return { uid: a[0], n: a[1], scores: a[2], t: a[3] }; }), at: c.at, cached: true, reads: 0 });
      }
      return env.db().then(function (db) {
        if (!db) return { rows: [], error: err('unavailable'), reads: 0 };
        return Promise.resolve(db.collection('kusogeRanks').limit(1000).get()).then(function (snap) {
          var reads = countSnap(snap), rows = snap.docs.map(legacyRow);
          try { setJSON(KEYS.legacy, { at: now(), rows: rows.map(function (r) { return [r.uid, r.n, r.scores, r.t]; }) }); } catch (e) {}
          return { rows: rows, at: now(), cached: false, reads: reads };
        }, function (e) { return { rows: [], error: e, reads: 1 }; });
      });
    },
    // 旧総合：ゲームごとの順位を点数にして合計（1位＝100点、n人中の最下位 ≈ 100/n。同点は良い方の順位）
    overall: function (opt) {
      return legacy.all(opt).then(function (a) {
        if (a.error) return a;
        var pts = {}, cnt = {}, byUid = {};
        a.rows.forEach(function (r) { byUid[r.uid] = r; });
        rankGames().forEach(function (g) {
          var list = flag(legacyGame(a.rows, g.id), g.id).filter(function (r) { return !r.out; }), n = list.length;
          list.forEach(function (r) {
            var p = Math.round(100 * (n - (r.rank - 1)) / n);
            pts[r.uid] = (pts[r.uid] || 0) + p; cnt[r.uid] = (cnt[r.uid] || 0) + 1;
          });
        });
        var rows = Object.keys(pts).map(function (uid) { return { uid: uid, n: byUid[uid].n, s: pts[uid], games: cnt[uid], t: byUid[uid].t, dur: 0 }; });
        rows.sort(function (x, y) { return y.s - x.s || (x.t || 0) - (y.t || 0); });
        var n = 0, prev = null, pr = 0;
        rows.forEach(function (x) { n++; x.rank = prev === x.s ? pr : n; prev = x.s; pr = x.rank; x.out = null; });
        return { rows: rows, total: rows.length, at: a.at, cached: a.cached, reads: a.reads };
      });
    },
  };
  function legacyGame(rows, id) {
    return rows.filter(function (r) { return Number(r.scores[id]) > 0; })
      .map(function (r) { return { uid: r.uid, n: r.n, s: Number(r.scores[id]), t: r.t, dur: 0 }; });
  }

  // ------------------------------------------------------------------ ゲームのイベント
  function hook() {
    var P_ = P(); if (!P_ || !P_.on || hook.done) return; hook.done = true;
    P_.on('played', function (p) {
      if (!p || !p.rankable || !p.entry || !perPlay(p.game)) return;
      var v = Math.floor(Number(p.entry.s) || 0); if (!(v > 0)) return;
      submit(p.game, v, { periods: PERIODS, durationMs: p.entry.d, mode: p.mode }).catch(function () {});
    });
    P_.on('best', function () { schedule(); });
  }

  // 登録簿の rankSource のキーが書き換わったら schedule()（cloud.js と同じく setItem を包む。値が同じなら何もしない）。
  // cloud.js が別の端末の記録を取り込んだときも、ここを通る。
  function watch() {
    if (watch.done || typeof Storage === 'undefined' || !root.localStorage) return; watch.done = true;
    try {
      var keys = {}; rankGames().forEach(function (g) { keys[g.rankSource.key] = 1; });
      var Pr = Storage.prototype, orig = Pr.setItem;
      Pr.setItem = function (k, v) {
        var hit = this === root.localStorage && keys[k] === 1, before = null;
        if (hit) { try { before = Pr.getItem.call(this, k); } catch (e) {} }
        orig.apply(this, arguments);
        if (hit && before !== String(v)) schedule();
      };
    } catch (e) {}
  }
  // ログインしている（Google か、前に作ったゲスト）なら、ページを開いたときに1回だけ確かめる（初めてなら移行）。
  // ログインしていない人のために、ここで匿名のアカウントは作らない（送るものができたときに submit が作る）。
  function autoStart() {
    var C = env.cloud(); if (!C || !C.onChange || autoStart.done) return; autoStart.done = true;
    var started = false;
    try { C.onChange(function (s) { if (!started && s && (s.user || s.guest) && nick()) { started = true; schedule(); } }); } catch (e) {}
  }

  var KoboRank = {
    version: VERSION, KEYS: KEYS, PERIODS: PERIODS.slice(), TOP: TOP, CACHE_MS: CACHE_MS, LEGACY_END: LEGACY_END,
    DAY_WRITES: DAY_WRITES,
    board: board, boards: boards, periodKey: periodKey, weekRange: weekRange, dayKey: dayKey, weekKey: weekKey,
    check: check, flag: flag, perPlay: perPlay, rankGames: rankGames,
    submit: submit, submitBests: submitBests, schedule: schedule, sentValue: sentValue,
    top: top, overall: overall, hasOverall: hasOverall, legacy: legacy,
    rulesOff: function () { return rulesOff(RULES_READ_BACKOFF); },
    stats: stats,
    // テスト用：環境を差し替える（now, storage, cloud, db, serverTime）
    _env: function (o) { Object.assign(env, o || {}); return env; },
    _reset: function () { mem = {}; lastWrite = {}; chain = Promise.resolve(); if (timer) clearTimeout(timer); timer = 0; lastFlush = -Infinity; stats.reads = stats.writes = stats.queries = stats.gets = stats.denied = 0; },
  };
  root.KoboRank = KoboRank;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboRank;
  hook();
  if (root.document) { watch(); autoStart(); }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
