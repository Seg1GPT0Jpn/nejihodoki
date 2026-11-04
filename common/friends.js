// ひまつぶし工房：フレンド KoboFriends（P3-5。SYSTEM_ARCHITECTURE.md 9章・14章、PRD P-7・R-6）
// ---------------------------------------------------------------------------------
// 読み込み：games.js・platform.js のあと、firebase-config.js → cloud.js のあと（rank.js があればランキングにも使う）。
//           どれがなくても例外は出さない（通信が要る操作は { ok:false, reason } を返す）。node のテストでは require() できる。
//
// しくみ（一方向。相手の公開プロフィールとスコアが見えるだけ）：
//   自分のコード：8文字（2-9 と、I と O を除く A-Z）。kbCodes/{code} = { u: uid, t }（作るだけ。一覧は読めない）。
//     作ったコードは kobo.profile の code / codeU（そのコードの uid）に置く（kobo.profile は cloud.js が同期する）。
//     アカウントが変わったら（codeU が違う）、新しいコードを作る。
//   相手を足す：kbCodes/{code} を get → uid。kbProfiles/{uid} を get して名前を覚える（読み取り2件）。
//   一覧：kobo.friends = { uid: { n, code, at, rm? } }（rm = 外した時刻。トゥームストーン）。最大30人。
//     マージは KoboPlatform.merge.friends（uid ごとに新しい出来事。cloud.js が PLATFORM_SYNC で同期する）。
//   表示：profiles() は kbProfiles を1人1件 get（自分を入れて最大31件）。board(game, period) は
//     kbBoards/{board}/e を where('u', 'in', [最大30人]).limit(30)（読み取りは載っている人数ぶん）。どちらも5分キャッシュ。
//
//   KoboFriends.list() → [{ uid, n, code, at }]（新しい順） / count() / has(uid) / raw()
//   KoboFriends.myCode() → 'ABCD2345' | null / ensureCode() → Promise<{ ok, code, created?, reason? }>
//   KoboFriends.add(code) → Promise<{ ok, friend?, reason? }>   reason: bad-code | notfound | self | exists | full | db | denied | error
//   KoboFriends.remove(uid) → bool
//   KoboFriends.profiles({ fresh }) → Promise<{ rows: [{ uid, n, lv, title, icon, xpw, me, missing }], reads, cached, error? }>
//   KoboFriends.overall({ fresh }) → Promise<{ rows（今週の XP の順。rank つき）, reads, cached, error? }>
//   KoboFriends.board(game, period, { fresh }) → Promise<{ rows, board, reads, cached, error? }>（KoboRank.top と同じ形）
//   KoboFriends.normCode(s) / validCode(s) / genCode(rnd?) / ICONS（プロフィールのアイコン）/ iconChar(id)
(function (root) {
  'use strict';

  var VERSION = 1;
  var KEYS = { friends: 'kobo.friends', profile: 'kobo.profile', cache: 'kobo.friendsCache' };
  var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;
  var MAX = 30, IN_MAX = 30, CACHE_MS = 5 * 60000, CACHE_KEEP = 12;
  // プロフィールのアイコン（プリセット）。kbProfiles.icon には id（16文字まで）を入れる。id を消したり変えたりしない（足すのはよい）
  var ICONS = [
    { id: 'cat', ch: '🐱' }, { id: 'dog', ch: '🐶' }, { id: 'fox', ch: '🦊' }, { id: 'bear', ch: '🐻' }, { id: 'panda', ch: '🐼' },
    { id: 'rabbit', ch: '🐰' }, { id: 'frog', ch: '🐸' }, { id: 'owl', ch: '🦉' }, { id: 'penguin', ch: '🐧' }, { id: 'octopus', ch: '🐙' },
    { id: 'whale', ch: '🐳' }, { id: 'robot', ch: '🤖' }, { id: 'ghost', ch: '👻' }, { id: 'star', ch: '⭐' }, { id: 'fire', ch: '🔥' },
    { id: 'clover', ch: '🍀' }, { id: 'blossom', ch: '🌸' }, { id: 'puzzle', ch: '🧩' }, { id: 'rocket', ch: '🚀' }, { id: 'crown', ch: '👑' },
    { id: 'gem', ch: '💎' }, { id: 'bolt', ch: '⚡' }, { id: 'nut', ch: '🔩' }, { id: 'dice', ch: '🎲' },
  ];
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var finite = function (v, d) { var n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };

  // ------------------------------------------------------------------ 環境（テストで差し替えられる）
  var env = {
    now: function () { return Date.now(); },
    random: function () { return Math.random(); },
    storage: function () { try { return root.localStorage || null; } catch (e) { return null; } },
    cloud: function () { return root.KoboCloud || null; },
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
  function getRaw(k) { var s = env.storage(); try { return s ? s.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { return k in mem ? mem[k] : null; } }
  function setRaw(k, v) { var s = env.storage(); try { if (s) s.setItem(k, v); else mem[k] = v; } catch (e) { mem[k] = v; } }
  function getJSON(k, d) { var s = getRaw(k); if (s == null) return d; try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function setJSON(k, v) { setRaw(k, JSON.stringify(v)); }
  function P() { return root.KoboPlatform || null; }
  function now() { return env.now(); }
  var stats = { reads: 0, writes: 0 };
  var denied = function (e) { return !!e && (e.code === 'permission-denied' || /permission/i.test(String(e.code || e.message || ''))); };
  function countSnap(snap) { var n = snap && snap.size ? snap.size : (snap && snap.docs ? snap.docs.length : 0); stats.reads += Math.max(1, n); return Math.max(1, n); }

  // ------------------------------------------------------------------ コード
  // 全角・小文字・空白・ハイフンを許す（「abcd-2345」も「ＡＢＣＤ２３４５」も同じ）
  function normCode(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFKC'); } catch (e) {}
    return s.toUpperCase().replace(/[\s\-_・ー]/g, '');
  }
  function validCode(s) { return CODE_RE.test(String(s || '')); }
  function genCode(rnd) {
    rnd = rnd || env.random;
    var c = '';
    for (var i = 0; i < 8; i++) c += ALPHABET.charAt(Math.floor(rnd() * ALPHABET.length) % ALPHABET.length);
    return c;
  }
  function profile() { var o = getJSON(KEYS.profile, {}); return isObj(o) ? o : {}; }
  function me() { var C = env.cloud(); try { var u = C && C.user ? C.user() : null; if (u && u.uid) return u.uid; return C && C.me ? C.me() : null; } catch (e) { return null; } }
  function myCode() {
    var p = profile(), uid = me();
    if (!validCode(p.code)) return null;
    if (uid && p.codeU && p.codeU !== uid) return null; // made for another account
    return p.code;
  }
  function whoAmI(create) {
    var C = env.cloud(); if (!C) return Promise.resolve(null);
    var uid = me();
    if (uid) return Promise.resolve({ uid: uid });
    if (!create || !C.ensureGuest) return Promise.resolve(null);
    return Promise.resolve(C.ensureGuest()).then(function (x) { return x && x.uid ? x : null; }, function () { return null; });
  }
  function saveCode(code, uid) {
    var p = profile();
    p.v = p.v || 1; if (!p.created) p.created = now();
    p.code = code; p.codeU = uid;
    setJSON(KEYS.profile, p);
  }
  var codeBusy = null;
  function ensureCode() {
    if (codeBusy) return codeBusy;
    codeBusy = whoAmI(true).then(function (u) {
      if (!u) return { ok: false, reason: 'signin' };
      var p = profile();
      if (validCode(p.code) && p.codeU === u.uid) return { ok: true, code: p.code };
      return env.db().then(function (db) {
        if (!db) return { ok: false, reason: 'db' };
        var tries = 0;
        function attempt() {
          if (++tries > 6) return Promise.resolve({ ok: false, reason: 'busy' });
          var code = genCode(), ref = db.collection('kbCodes').doc(code);
          return Promise.resolve(ref.get()).then(function (snap) {
            stats.reads++;
            if (snap && snap.exists) {
              var d = snap.data() || {};
              if (d.u === u.uid) { saveCode(code, u.uid); return { ok: true, code: code }; }
              return attempt(); // someone else's code: draw again
            }
            return Promise.resolve(ref.set({ u: u.uid, t: env.serverTime() })).then(function () {
              stats.writes++; saveCode(code, u.uid); return { ok: true, code: code, created: true };
            });
          });
        }
        return attempt();
      });
    }).then(function (r) { codeBusy = null; return r; }, function (e) { codeBusy = null; return { ok: false, reason: denied(e) ? 'denied' : 'error', error: e }; });
    return codeBusy;
  }

  // ------------------------------------------------------------------ 一覧
  function raw() { var o = getJSON(KEYS.friends, {}); return isObj(o) ? o : {}; }
  function on(e) { var p = P(); return p && p.merge && p.merge.friendOn ? p.merge.friendOn(e) : (isObj(e) && !(finite(e.rm, 0) >= finite(e.at, 0) && finite(e.rm, 0) > 0)); }
  function list() {
    var o = raw();
    return Object.keys(o).filter(function (k) { return on(o[k]); })
      .map(function (k) { return { uid: k, n: String(o[k].n || ''), code: String(o[k].code || ''), at: finite(o[k].at, 0) }; })
      .sort(function (a, b) { return b.at - a.at || (a.uid < b.uid ? -1 : 1); });
  }
  function count() { return list().length; }
  function has(uid) { var o = raw(); return !!(uid && on(o[uid])); }
  function save(o) {
    var p = P();
    if (p && p.merge && p.merge.friendsValue) o = p.merge.friendsValue(o, {}, { now: now() }); // prune + cap the same way the merge does
    setJSON(KEYS.friends, o);
  }
  function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }

  function add(input) {
    var code = normCode(input);
    if (!validCode(code)) return Promise.resolve({ ok: false, reason: 'bad-code' });
    if (code === myCode()) return Promise.resolve({ ok: false, reason: 'self' });
    if (count() >= MAX) return Promise.resolve({ ok: false, reason: 'full' });
    return env.db().then(function (db) {
      if (!db) return { ok: false, reason: 'db' };
      return Promise.resolve(db.collection('kbCodes').doc(code).get()).then(function (snap) {
        stats.reads++;
        if (!snap || !snap.exists) return { ok: false, reason: 'notfound' };
        var uid = (snap.data() || {}).u;
        if (typeof uid !== 'string' || !uid) return { ok: false, reason: 'notfound' };
        if (uid === me()) return { ok: false, reason: 'self' };
        if (has(uid)) return { ok: false, reason: 'exists', friend: list().filter(function (f) { return f.uid === uid; })[0] };
        return Promise.resolve(db.collection('kbProfiles').doc(uid).get()).then(function (ps) {
          stats.reads++;
          return ps && ps.exists ? cleanName((ps.data() || {}).n) : '';
        }, function () { return ''; }).then(function (n) {
          if (count() >= MAX) return { ok: false, reason: 'full' };
          var o = raw();
          o[uid] = { n: n, code: code, at: Math.max(now(), finite(o[uid] && o[uid].rm, 0) + 1) };
          save(o); dropCache();
          return { ok: true, friend: { uid: uid, n: n, code: code, at: o[uid].at } };
        });
      });
    }).catch(function (e) { return { ok: false, reason: denied(e) ? 'denied' : 'error', error: e }; });
  }
  function remove(uid) {
    var o = raw(), e = o[uid];
    if (!on(e)) return false;
    o[uid] = { n: String(e.n || ''), code: String(e.code || ''), at: finite(e.at, 0), rm: Math.max(now(), finite(e.at, 0)) };
    save(o); dropCache();
    return true;
  }

  // ------------------------------------------------------------------ キャッシュ（kobo.friendsCache）
  function sig(uids) { return uids.slice().sort().join(','); }
  function cacheGet(key, s) {
    var c = getJSON(KEYS.cache, {}), e = isObj(c) ? c[key] : null;
    if (!e || e.sig !== s || !(now() - e.at < CACHE_MS) || now() < e.at || !Array.isArray(e.rows)) return null;
    return e;
  }
  function cachePut(key, s, rows) {
    var c = getJSON(KEYS.cache, {}); if (!isObj(c)) c = {};
    c[key] = { at: now(), sig: s, rows: rows };
    var ks = Object.keys(c).filter(function (k) { return now() - (c[k] && c[k].at || 0) < CACHE_MS; });
    ks.sort(function (a, b) { return c[b].at - c[a].at; });
    var out = {}; ks.slice(0, CACHE_KEEP).forEach(function (k) { out[k] = c[k]; });
    setJSON(KEYS.cache, out);
  }
  function dropCache() { setJSON(KEYS.cache, {}); }
  function weekNo() { var p = P(); return p && p.jstWeekKey ? p.jstWeekKey(now()) : Math.floor((now() + 9 * 3600000 + 3 * 86400000) / (7 * 86400000)); }
  function who() { var uids = list().map(function (f) { return f.uid; }), m = me(); if (m && uids.indexOf(m) < 0) uids.push(m); return uids; }

  // 公開プロフィール（自分を入れて最大31件の get）
  function profiles(opt) {
    opt = opt || {};
    var uids = who(), s = sig(uids), key = 'p:w' + weekNo();
    if (!uids.length) return Promise.resolve({ rows: [], reads: 0, cached: false });
    var hit = opt.fresh ? null : cacheGet(key, s);
    if (hit) return Promise.resolve({ rows: hit.rows, reads: 0, cached: true, at: hit.at });
    var m = me(), names = {}; list().forEach(function (f) { names[f.uid] = f.n; });
    return env.db().then(function (db) {
      if (!db) return { rows: [], reads: 0, error: { code: 'unavailable' } };
      var wk = weekNo(), firstErr = null, reads = 0;
      return Promise.all(uids.map(function (uid) {
        return Promise.resolve(db.collection('kbProfiles').doc(uid).get()).then(function (d) {
          reads++; stats.reads++;
          var x = d && d.exists ? (d.data() || {}) : null;
          return {
            uid: uid, me: uid === m, missing: !x,
            n: cleanName(x && x.n) || names[uid] || '', lv: x ? Math.max(1, finite(x.lv, 1)) : 0,
            title: x && typeof x.title === 'string' ? x.title : '', icon: x && typeof x.icon === 'string' ? x.icon : '',
            xpw: x && x.wk === wk ? Math.max(0, finite(x.xpw, 0)) : 0,
          };
        }, function (e) { reads++; stats.reads++; firstErr = firstErr || e; return null; });
      })).then(function (rows) {
        rows = rows.filter(Boolean);
        if (!rows.length && firstErr) return { rows: [], reads: reads, error: firstErr };
        cachePut(key, s, rows);
        return { rows: rows, reads: reads, cached: false, at: now() };
      });
    });
  }
  function ranked(rows) {
    var n = 0, prev = null, pr = 0;
    rows.forEach(function (x) { if (x.out) { x.rank = null; return; } n++; x.rank = prev === x.s ? pr : n; prev = x.s; pr = x.rank; });
    return rows;
  }
  // フレンドと自分の、今週の XP の順位
  function overall(opt) {
    return profiles(opt).then(function (r) {
      var rows = r.rows.filter(function (x) { return x.xpw > 0; })
        .map(function (x) { return { uid: x.uid, n: x.n, s: x.xpw, t: 0, dur: 0, lv: x.lv, title: x.title, icon: x.icon, out: null }; });
      rows.sort(function (a, b) { return b.s - a.s || (a.uid < b.uid ? -1 : 1); });
      return { rows: ranked(rows), reads: r.reads, cached: r.cached, at: r.at, error: r.error };
    });
  }
  // ゲームのボードのうち、フレンドと自分の行だけ
  function board(game, period, opt) {
    opt = opt || {};
    var R = root.KoboRank, b = R && R.board ? R.board(game, period) : null;
    if (!b) return Promise.resolve({ rows: [], board: b, reads: 0, error: { code: 'game' } });
    var uids = who(), s = sig(uids), key = 'b:' + b;
    if (!uids.length) return Promise.resolve({ rows: [], board: b, reads: 0, cached: false });
    var hit = opt.fresh ? null : cacheGet(key, s);
    var finish = function (rows) { rows = R.flag ? R.flag(rows.map(function (x) { return Object.assign({}, x); }), game) : rows; return rows; };
    if (hit) return Promise.resolve({ rows: finish(hit.rows), board: b, reads: 0, cached: true, at: hit.at });
    return env.db().then(function (db) {
      if (!db) return { rows: [], board: b, reads: 0, error: { code: 'unavailable' } };
      var chunks = [];
      for (var i = 0; i < uids.length; i += IN_MAX) chunks.push(uids.slice(i, i + IN_MAX));
      var reads = 0;
      return Promise.all(chunks.map(function (ch) {
        return Promise.resolve(db.collection('kbBoards').doc(b).collection('e').where('u', 'in', ch).limit(IN_MAX).get()).then(function (snap) {
          reads += countSnap(snap);
          return snap.docs.map(function (d) {
            var x = d.data() || {};
            var t = x.t && x.t.toMillis ? x.t.toMillis() : (typeof x.t === 'number' ? x.t : 0);
            return { uid: d.id, n: typeof x.n === 'string' ? x.n : '', s: Number(x.s), t: t, dur: x.m && x.m.dur > 0 ? Number(x.m.dur) : 0 };
          });
        });
      })).then(function (parts) {
        var rows = [].concat.apply([], parts);
        cachePut(key, s, rows);
        return { rows: finish(rows), board: b, reads: reads, cached: false, at: now() };
      }, function (e) { return { rows: [], board: b, reads: Math.max(1, reads), error: e }; });
    });
  }

  var KoboFriends = {
    version: VERSION, KEYS: KEYS, MAX: MAX, ALPHABET: ALPHABET, CACHE_MS: CACHE_MS, ICONS: ICONS,
    iconChar: function (id) { for (var i = 0; i < ICONS.length; i++) if (ICONS[i].id === id) return ICONS[i].ch; return ''; },
    normCode: normCode, validCode: validCode, genCode: genCode,
    list: list, count: count, has: has, raw: raw, myCode: myCode, ensureCode: ensureCode, add: add, remove: remove,
    profiles: profiles, overall: overall, board: board, stats: stats,
    _env: function (o) { Object.assign(env, o || {}); return env; },
    _reset: function () { mem = {}; codeBusy = null; stats.reads = stats.writes = 0; },
  };
  root.KoboFriends = KoboFriends;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboFriends;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
