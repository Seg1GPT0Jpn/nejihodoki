// ひまつぶし工房：プラットフォームの中心 KoboPlatform（全ページ共通）
// ---------------------------------------------------------------------------------
// 読み込み：<head> で i18n.js → games.js → platform.js の順（SYSTEM_ARCHITECTURE.md 1章）。
//           games.js がなくても動く（そのときゲームごとの処理は何もしない）。node のテストでは require() できる。
// 端末だけで完結する。通信はしない（ランキングやプレイ回数の送信は rank.js / cloud.js が、ここの記録を読んで行う）。
//
//   KoboPlatform.store.get(k, d) / set(k, v) / raw(k) / setRaw(k, s) / del(k) / available()
//        JSON つきの localStorage。使えないとき（プライベートモード・容量の上限）は、このページの間だけメモリに置く
//   KoboPlatform.on(type, f) → off()   / once(type, f) / off(type, f) / emit(type, payload)
//        イベント：play_start, play_end, best, stage_clear, progress（ゲームから。KoboGame.emit 経由）
//                  achievement（プラットフォームが出す。P3-1）, played（play_end を記録し終えた）, fav, '*'（全部）
//   KoboPlatform.jstDateKey(ms?) → 20261104（日本時間の日付。端末のタイムゾーンと夏時間に左右されない）
//   KoboPlatform.jstWeekKey(ms?) → 日本時間の月曜0時に切り替わる週の通し番号 / jstParts(ms?) / jstDayStart(key) / addDays(key, n)
//   KoboPlatform.hash32(str) → 32bit の整数（xmur3） / rng(seed) → 0〜1 の関数（mulberry32。versus.js と同じ列）
//   KoboPlatform.dailySeed(gameId, dateKey?) = hash32('kobo:' + gameId + ':' + dateKey)
//   KoboPlatform.history.list() / add(entry) / clear()         kobo.history（最新50件）
//   KoboPlatform.fav.has(id) / set(id, on) / toggle(id) / list() kobo.fav
//   KoboPlatform.stats.get(id) / all() / record(id, delta)       kobo.stats（端末ごと → 合計して返す）
//   KoboPlatform.plays.today() / pending() / markSent(dateKey, id) / week(key?)   kobo.plays（匿名の回数だけ。端末だけ）
//   KoboPlatform.daily.get(dateKey?, id?) / record(id, dateKey, { score, cleared })   kobo.daily
//   KoboPlatform.migrations.add({ id, v, run }) / run() / done(id) / version() / list
//   KoboPlatform.merge.make(rule) / value(rule, a, b, ctx) / history / fav / daily   マージ関数（cloud.js 用）
//   KoboPlatform.syncMap({ legacy }) → KoboCloud.sync に渡す { key: 'max' | 'newest' | { merge } }
//   KoboPlatform.rankValue(id, getRaw?) / recordValue(id, getRaw?) / recordText(id, t?)
//   KoboPlatform.game(id) / games() / genres() / launch(search?) / devId() / rankable(mode) / fx
//   KoboPlatform.theme.get() / set(t) / apply()   html[data-kb-theme]（theme-color の meta は data-kb-theme-color があるときだけ）
(function (root) {
  'use strict';

  var VERSION = 1;
  var DAY = 86400000, JST = 9 * 3600000;
  var KEYS = {
    history: 'kobo.history', fav: 'kobo.fav', stats: 'kobo.stats', plays: 'kobo.plays', daily: 'kobo.daily',
    migrated: 'kobo.migrated', dev: 'kobo.dev', theme: 'kobo.theme', profile: 'kobo.profile', ach: 'kobo.ach', xp: 'kobo.xp',
    audio: 'kobo.audio', nick: 'kobo.nick',
  };
  var HISTORY_MAX = 50, DAILY_KEEP_DAYS = 60, PLAYS_KEEP_DAYS = 35;
  var MODES = ['normal', 'daily', 'versus', 'practice'];

  var now = function () { return Date.now(); };
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var clone = function (v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
  var finite = function (v, d) { var n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };

  // ------------------------------------------------------------------ storage
  // localStorage が使えないときは、メモリに置く（ページを閉じると消えるが、遊んでいる間は正しく動く）
  var mem = {};
  function ls() { try { var s = root.localStorage; return s || null; } catch (e) { return null; } }
  var store = {
    available: function () {
      var s = ls(); if (!s) return false;
      try { var k = '__kobo_probe'; s.setItem(k, '1'); s.removeItem(k); return true; } catch (e) { return false; }
    },
    raw: function (k) {
      var s = ls();
      if (s) { try { var v = s.getItem(k); if (v != null) return v; } catch (e) {} }
      return hasOwn(mem, k) ? mem[k] : null;
    },
    setRaw: function (k, v) {
      v = String(v);
      var s = ls();
      if (s) { try { s.setItem(k, v); delete mem[k]; return true; } catch (e) {} }
      mem[k] = v; return false;
    },
    get: function (k, d) {
      var v = store.raw(k);
      if (v == null) return d;
      try { return JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) { return store.setRaw(k, JSON.stringify(v)); },
    del: function (k) { delete mem[k]; var s = ls(); if (s) { try { s.removeItem(k); } catch (e) {} } },
  };
  function getObj(k) { var v = store.get(k, null); return isObj(v) ? v : {}; }

  // ------------------------------------------------------------------ registry
  function reg() { return root.KOBO_REGISTRY || null; }
  function game(id) { var r = reg(); return r ? r.byId(id) : null; }
  function games() { var r = reg(); return r ? r.games.slice() : []; }
  function genres() { var r = reg(); return r ? r.genres.slice() : []; }

  // ------------------------------------------------------------------ events
  var listeners = {};
  function on(type, f) {
    if (typeof f !== 'function') return function () {};
    (listeners[type] = listeners[type] || []).push(f);
    return function () { off(type, f); };
  }
  function off(type, f) {
    var a = listeners[type]; if (!a) return;
    var i = a.indexOf(f); if (i >= 0) a.splice(i, 1);
  }
  function once(type, f) { var o = on(type, function (p) { o(); f(p); }); return o; }
  function emit(type, payload) {
    var p = isObj(payload) ? payload : {};
    var list = (listeners[type] || []).concat(type === '*' ? [] : (listeners['*'] || []));
    for (var i = 0; i < list.length; i++) {
      try { list[i](p, type); } catch (e) { if (root.console) console.warn('KoboPlatform', type, e); }
    }
    return p;
  }

  // ------------------------------------------------------------------ time (Asia/Tokyo, UTC+9, no DST)
  // ms + 9時間 を UTC として読むと日本時間の壁時計になる。getUTC* だけを使うので、端末のタイムゾーンは関係ない。
  function toMs(ms) { if (ms instanceof Date) ms = ms.getTime(); ms = Number(ms); return isFinite(ms) ? ms : now(); }
  function jstParts(ms) {
    var d = new Date(toMs(ms === undefined ? now() : ms) + JST);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay() };
  }
  function jstDateKey(ms) { var p = jstParts(ms); return p.y * 10000 + p.m * 100 + p.d; }
  // 週の通し番号：floor((ms + 9h + 3日) / 7日)。1970-01-01 は木曜なので、+3日で日本時間の月曜0時が境目になる
  function jstWeekKey(ms) { return Math.floor((toMs(ms === undefined ? now() : ms) + JST + 3 * DAY) / (7 * DAY)); }
  function parseKey(key) {
    key = Number(key); if (!isFinite(key)) return null;
    var y = Math.floor(key / 10000), m = Math.floor(key / 100) % 100, d = key % 100;
    if (y < 1970 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    var t = Date.UTC(y, m - 1, d);
    var c = new Date(t); if (c.getUTCMonth() !== m - 1 || c.getUTCDate() !== d) return null;
    return t;
  }
  function isDateKey(key) { return /^\d{8}$/.test(String(key)) && parseKey(key) != null; }
  // その日（日本時間）の0時の ms
  function jstDayStart(key) { var t = parseKey(key); return t == null ? NaN : t - JST; }
  function addDays(key, n) { var t = jstDayStart(key); return isFinite(t) ? jstDateKey(t + Math.round(n) * DAY) : NaN; }
  function daysBetween(a, b) { return Math.round((jstDayStart(b) - jstDayStart(a)) / DAY); }

  // ------------------------------------------------------------------ hash / rng
  // xmur3：文字列 → 32bit。hash32(s) はその最初の値
  function xmur3(str) {
    str = String(str);
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function hash32(str) { return xmur3(str)(); }
  // mulberry32：versus.js の KoboVersus.rng と同じ列を返す（同じ seed なら全員同じ）
  function rng(seed) {
    var a = (Number(seed) >>> 0) || 1;
    var f = function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = function (n) { return Math.floor(f() * n); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    return f;
  }
  function dailySeed(gameId, dateKey) { return hash32('kobo:' + gameId + ':' + (dateKey == null ? jstDateKey() : dateKey)); }

  // ------------------------------------------------------------------ device id (local only, never synced)
  var devCache = null;
  function devId() {
    if (devCache) return devCache;
    var v = store.raw(KEYS.dev);
    if (!v || !/^[a-z0-9]{6,16}$/.test(v)) {
      v = '';
      for (var i = 0; i < 10; i++) v += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36));
      store.setRaw(KEYS.dev, v);
    }
    return (devCache = v);
  }

  // ------------------------------------------------------------------ merge (for cloud.js)
  // ctx = { localT, remoteT, now }。'newest' のフィールドは時刻の新しい側を取る。時刻が同じ（または無い）ときは、
  // どちらの端末で計算しても同じ結果になるように、JSON の文字列が大きい方を取る。
  function newerSide(a, b, ctx) {
    var lt = ctx && finite(ctx.localT, 0), rt = ctx && finite(ctx.remoteT, 0);
    if (lt !== rt) return lt > rt ? 'a' : 'b';
    var sa = JSON.stringify(a), sb = JSON.stringify(b);
    return sa >= sb ? 'a' : 'b';
  }
  function numOr(v) { var n = Number(v); return (v === null || v === '' || typeof v === 'boolean' || !isFinite(n)) ? null : n; }
  // better(cmp, x, y) > 0 なら x の方が良い
  function cmpVal(cmp, x, y) {
    var nx = numOr(x), ny = numOr(y);
    if (cmp === 'minPos') {
      var px = nx != null && nx > 0, py = ny != null && ny > 0;
      if (px !== py) return px ? 1 : -1;
      if (!px) return 0;
      return nx < ny ? 1 : nx > ny ? -1 : 0;
    }
    if (nx == null || ny == null) return (nx == null ? 0 : 1) - (ny == null ? 0 : 1);
    if (cmp === 'min') return nx < ny ? 1 : nx > ny ? -1 : 0;
    return nx > ny ? 1 : nx < ny ? -1 : 0; // 'max'
  }
  function mergeValue(rule, a, b, ctx) {
    if (a === undefined) return clone(b);
    if (b === undefined) return clone(a);
    if (rule === 'mapMax') rule = { each: 'max' };
    var side = function () { return newerSide(a, b, ctx) === 'a' ? clone(a) : clone(b); };
    if (typeof rule === 'string') {
      switch (rule) {
        case 'max': case 'min': case 'minPos': {
          var c = cmpVal(rule, a, b);
          if (c > 0) return clone(a); if (c < 0) return clone(b);
          return side();
        }
        case 'or': return a ? clone(a) : clone(b);
        case 'union': {
          if (!Array.isArray(a) || !Array.isArray(b)) return side();
          var first = newerSide(a, b, ctx) === 'a' ? a : b, second = first === a ? b : a;
          var out = [], seen = {};
          first.concat(second).forEach(function (x) { var k = JSON.stringify(x); if (!seen[k]) { seen[k] = 1; out.push(clone(x)); } });
          return out;
        }
        case 'arrMax': {
          if (!Array.isArray(a) || !Array.isArray(b)) return side();
          var n = Math.max(a.length, b.length), r = [];
          for (var i = 0; i < n; i++) r.push(mergeValue('max', a[i], b[i], ctx));
          return r;
        }
        default: return side(); // 'newest' and unknown
      }
    }
    if (!isObj(rule) || !isObj(a) || !isObj(b)) return side();
    if (rule.each !== undefined) {
      var res = {}, ks = keysUnion(a, b, newerSide(a, b, ctx));
      ks.forEach(function (k) { res[k] = mergeValue(rule.each, a[k], b[k], ctx); });
      return res;
    }
    if (rule.version) {
      var va = numOr(a[rule.version]), vb = numOr(b[rule.version]);
      if ((va != null || vb != null) && va !== vb) return (va == null ? -Infinity : va) > (vb == null ? -Infinity : vb) ? clone(a) : clone(b);
    }
    var fields = rule.fields || {}, rest = rule.rest || 'newest', grouped = {}, o = {};
    var keys = keysUnion(a, b, newerSide(a, b, ctx));
    (rule.groups || []).forEach(function (g) {
      var c = 0;
      for (var i = 0; i < g.keys.length && !c; i++) c = cmpVal((g.cmp && g.cmp[i]) || 'max', a[g.keys[i]], b[g.keys[i]]);
      var src = c > 0 ? a : c < 0 ? b : (newerSide(a, b, ctx) === 'a' ? a : b);
      g.keys.forEach(function (k) { grouped[k] = 1; if (src[k] !== undefined) o[k] = clone(src[k]); });
    });
    keys.forEach(function (k) {
      if (grouped[k]) return;
      var v = mergeValue(hasOwn(fields, k) ? fields[k] : rest, a[k], b[k], ctx);
      if (v !== undefined) o[k] = v;
    });
    // keep the group keys in their natural position for stable output
    var out = {};
    keys.forEach(function (k) { if (hasOwn(o, k)) out[k] = o[k]; });
    return out;
  }
  function keysUnion(a, b, first) {
    var x = first === 'a' ? a : b, y = first === 'a' ? b : a, ks = Object.keys(x);
    Object.keys(y).forEach(function (k) { if (!hasOwn(x, k)) ks.push(k); });
    return ks;
  }
  function parse(s) { if (s == null) return undefined; try { return JSON.parse(s); } catch (e) { return undefined; } }
  // 文字列どうしのマージ関数を作る：merge(localStr, remoteStr, ctx) → str。片方が無い・壊れているときはもう片方
  function makeMerge(rule, post) {
    var fn = function (localStr, remoteStr, ctx) {
      var a = parse(localStr), b = parse(remoteStr);
      if (a === undefined && b === undefined) return localStr != null ? localStr : remoteStr;
      var v = mergeValue(rule, a, b, ctx || {});
      if (post) v = post(v, ctx || {});
      return JSON.stringify(v);
    };
    fn.rule = rule;
    return fn;
  }
  // kobo.history：(g, t) で重複を除いた和集合を、新しい順に50件
  function mergeHistoryValue(a, b) {
    var seen = {}, out = [];
    [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach(function (e) {
      if (!isObj(e) || typeof e.g !== 'string') return;
      var k = e.g + '|' + finite(e.t, 0); if (seen[k]) return; seen[k] = 1; out.push(clone(e));
    });
    out.sort(function (x, y) { return finite(y.t, 0) - finite(x.t, 0) || (x.g < y.g ? -1 : x.g > y.g ? 1 : 0); });
    return out.slice(0, HISTORY_MAX);
  }
  // kobo.fav：{ id: +時刻（登録） / −時刻（解除） }。キーごとに絶対値の大きい方（同じなら登録）
  function mergeFavValue(a, b) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    var o = {};
    keysUnion(a, b, 'a').forEach(function (k) {
      var x = finite(a[k], 0), y = finite(b[k], 0);
      o[k] = Math.abs(x) !== Math.abs(y) ? (Math.abs(x) > Math.abs(y) ? x : y) : Math.max(x, y);
    });
    return o;
  }
  // kobo.daily：{ YYYYMMDD: { game: { best, tries, clearedAt } } }。60日より古い日は消す
  var DAILY_RULE = { each: { each: { fields: { best: 'max', tries: 'max', clearedAt: 'minPos' }, rest: 'max' } } };
  function pruneDaily(v, ctx) {
    if (!isObj(v)) return {};
    var cut = addDays(jstDateKey(ctx && ctx.now != null ? ctx.now : now()), -DAILY_KEEP_DAYS), o = {};
    Object.keys(v).forEach(function (k) { if (isDateKey(k) && Number(k) >= cut) o[k] = v[k]; });
    return o;
  }
  var merge = { make: makeMerge, value: mergeValue, daily: makeMerge(DAILY_RULE, pruneDaily) };
  // history と fav は規則で書けないので、専用の関数
  merge.history = function (l, r) {
    var a = parse(l), b = parse(r);
    if (a === undefined && b === undefined) return l != null ? l : r;
    return JSON.stringify(mergeHistoryValue(a, b));
  };
  merge.fav = function (l, r) {
    var a = parse(l), b = parse(r);
    if (a === undefined && b === undefined) return l != null ? l : r;
    return JSON.stringify(mergeFavValue(a, b));
  };
  // 端末とゲームとフィールドごとに大きい方
  merge.stats = makeMerge({ each: { each: { each: 'max' } } });
  // 取った実績は和集合、時刻は早い方
  merge.ach = makeMerge({ each: 'minPos' });
  // XP（4.4）：(日, 端末, キー) ごとに大きい方、arch は大きい方。35日より古い分を arch にまとめるのは P3-1
  merge.xp = makeMerge({ fields: { v: 'max', d: { each: { each: { each: 'max' } } }, arch: 'max' } });
  merge.profile = makeMerge({ fields: { v: 'max', created: 'minPos' }, rest: 'newest' });

  // プラットフォームのキーの同期（SYSTEM_ARCHITECTURE.md 9章）。kobo.dev・kobo.plays などは端末だけ
  var PLATFORM_SYNC = {
    'kobo.nick': 'newest', 'kobo.profile': merge.profile, 'kobo.history': merge.history, 'kobo.fav': merge.fav,
    'kobo.stats': merge.stats, 'kobo.xp': merge.xp, 'kobo.ach': merge.ach, 'kobo.daily': merge.daily,
    'kobo.audio': 'newest', 'kobo.theme': 'newest',
  };
  var NATIVE = { max: 1, newest: 1 };
  function toCloud(rule, legacy) {
    if (typeof rule === 'string' && NATIVE[rule]) return rule;
    if (legacy) return 'newest'; // P1-5 より前の cloud.js は 'max' と 'newest' しか知らない
    if (typeof rule === 'function') return { merge: rule };
    return { merge: makeMerge(rule) };
  }
  // opt.games: 対象のゲーム ID（省略時は全部）、opt.platform: false でプラットフォームのキーを除く、opt.legacy: true で文字列だけ
  function syncMap(opt) {
    opt = opt || {};
    var out = {}, r = reg();
    var ids = opt.games || (r ? r.ids() : []);
    ids.forEach(function (id) {
      var g = game(id); if (!g || !g.sync) return;
      Object.keys(g.sync).forEach(function (k) { out[k] = toCloud(g.sync[k], opt.legacy); });
    });
    var shared = r && r.sharedSync;
    if (shared && opt.shared !== false) Object.keys(shared).forEach(function (k) { out[k] = toCloud(shared[k], opt.legacy); });
    if (opt.platform !== false) Object.keys(PLATFORM_SYNC).forEach(function (k) { out[k] = toCloud(PLATFORM_SYNC[k], opt.legacy); });
    return out;
  }

  // ------------------------------------------------------------------ rank / record values
  // cloud.js の num() と pick() と同じ読み方
  function num(raw) {
    var v; try { v = JSON.parse(raw); } catch (e) { v = raw; }
    var n = Number(v); return isFinite(n) ? n : 0;
  }
  function at(o, path) {
    var p = String(path).split('.');
    for (var i = 0; i < p.length; i++) { if (!o || typeof o !== 'object') return undefined; o = o[p[i]]; }
    return o;
  }
  function numericOf(v) {
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object') { var w = v.score != null ? v.score : v.size != null ? v.size : v.value; if (typeof w === 'number') return w; }
    return undefined;
  }
  function sourceValue(src, getRaw) {
    if (!src || !src.key) return 0;
    var raw = (getRaw || store.raw)(src.key);
    var v;
    if (!src.paths) v = num(raw);
    else {
      var o; try { o = JSON.parse(raw); } catch (e) { o = undefined; }
      if (!o || typeof o !== 'object') v = raw == null ? 0 : num(raw);
      else if (src.agg === 'max') {
        v = 0; src.paths.forEach(function (p) { var x = numericOf(at(o, p)); if (x !== undefined && x > v) v = x; });
      } else if (src.agg === 'or') {
        v = 0; for (var i = 0; i < src.paths.length; i++) { var y = at(o, src.paths[i]); if (y) { v = finite(y, 0); break; } }
      } else {
        v = 0; for (var j = 0; j < src.paths.length; j++) { var z = numericOf(at(o, src.paths[j])); if (z !== undefined) { v = z; break; } }
      }
    }
    v = finite(v, 0) + finite(src.offset, 0);
    return isFinite(v) ? v : 0;
  }
  // ランキングに送る値（整数、0 以上）。今の cloud.js の RANK_SOURCES と同じ値。hole は最高点（R10）
  function rankValue(id, getRaw) {
    var g = game(id); if (!g || !g.rankSource) return 0;
    return Math.max(0, Math.floor(sourceValue(g.rankSource, getRaw)));
  }
  // ハブのカードに出す自分の記録。表示しないときは null
  function recordValue(id, getRaw) {
    var g = game(id); if (!g || !g.record) return null;
    var v = sourceValue(g.record, getRaw);
    return v >= (g.record.min == null ? 1 : g.record.min) ? v : null;
  }
  function recordText(id, t, getRaw) {
    var g = game(id), v = recordValue(id, getRaw); if (v == null) return '';
    var n = g.record.num ? Number(v).toLocaleString() : v;
    var I = root.KoboI18n, tpl = g.record.tpl;
    if (typeof t === 'function') return t(tpl.ja, { n: n });
    var lang = I && I.lang === 'en' ? 'en' : 'ja';
    return String(tpl[lang] || tpl.ja).replace('{n}', n);
  }

  // ------------------------------------------------------------------ history
  var history = {
    list: function () { var a = store.get(KEYS.history, []); return Array.isArray(a) ? a : []; },
    add: function (e) {
      if (!isObj(e) || !game(e.g)) return null;
      var entry = { g: e.g, t: Math.round(finite(e.t, now())), d: Math.max(0, Math.round(finite(e.d, 0))), s: finite(e.s, 0), m: MODES.indexOf(e.m) >= 0 ? e.m : 'normal' };
      if (e.st != null) entry.st = finite(e.st, 0);
      store.set(KEYS.history, mergeHistoryValue([entry], history.list()));
      return entry;
    },
    clear: function () { store.set(KEYS.history, []); },
    last: function (id) { var a = history.list(); for (var i = 0; i < a.length; i++) if (!id || a[i].g === id) return a[i]; return null; },
  };

  // ------------------------------------------------------------------ favorites
  var fav = {
    raw: function () { return getObj(KEYS.fav); },
    has: function (id) { return finite(fav.raw()[id], 0) > 0; },
    set: function (id, onOff) {
      if (!game(id)) return false;
      var f = fav.raw(), prev = Math.abs(finite(f[id], 0));
      var t = Math.max(now(), prev + 1); // 同じミリ秒に2回押しても、あとの操作が勝つ
      f[id] = onOff ? t : -t; store.set(KEYS.fav, f);
      emit('fav', { game: id, on: !!onOff });
      return !!onOff;
    },
    toggle: function (id) { return fav.set(id, !fav.has(id)); },
    list: function () {
      var f = fav.raw();
      return Object.keys(f).filter(function (k) { return finite(f[k], 0) > 0 && game(k); }).sort(function (a, b) { return f[b] - f[a]; });
    },
  };

  // ------------------------------------------------------------------ stats  kobo.stats = { dev: { game: { plays, ms, clears } } }
  var stats = {
    raw: function () { return getObj(KEYS.stats); },
    record: function (id, delta) {
      if (!game(id) || !isObj(delta)) return;
      var all = stats.raw(), dv = devId(), mine = isObj(all[dv]) ? all[dv] : {}, s = isObj(mine[id]) ? mine[id] : {};
      ['plays', 'ms', 'clears'].forEach(function (f) { s[f] = Math.max(0, Math.round(finite(s[f], 0) + finite(delta[f], 0))); });
      mine[id] = s; all[dv] = mine; store.set(KEYS.stats, all);
    },
    get: function (id) {
      var all = stats.raw(), out = { plays: 0, ms: 0, clears: 0 };
      Object.keys(all).forEach(function (dv) {
        var s = isObj(all[dv]) && all[dv][id]; if (!isObj(s)) return;
        out.plays += finite(s.plays, 0); out.ms += finite(s.ms, 0); out.clears += finite(s.clears, 0);
      });
      return out;
    },
    all: function () { var o = {}; games().forEach(function (g) { o[g.id] = stats.get(g.id); }); return o; },
  };

  // ------------------------------------------------------------------ anonymous play counters (popularity)
  // kobo.plays = { d: { YYYYMMDD: { game: 回数 } }, sent: { YYYYMMDD: { game: 1 } } }。端末だけ（同期しない）。
  // 個人の情報は入れない。kbPlays（1週間1件、1ゲーム1日1回 +1）への送信は rank.js が pending() を見て行う。
  var plays = {
    raw: function () { var o = getObj(KEYS.plays); o.d = isObj(o.d) ? o.d : {}; o.sent = isObj(o.sent) ? o.sent : {}; return o; },
    count: function (id, ms) {
      if (!game(id)) return;
      var o = plays.raw(), k = String(jstDateKey(ms)), day = isObj(o.d[k]) ? o.d[k] : {};
      day[id] = finite(day[id], 0) + 1; o.d[k] = day;
      var cut = addDays(Number(k), -PLAYS_KEEP_DAYS);
      ['d', 'sent'].forEach(function (f) { Object.keys(o[f]).forEach(function (x) { if (!(Number(x) >= cut)) delete o[f][x]; }); });
      store.set(KEYS.plays, o);
    },
    today: function (ms) { var o = plays.raw(); return Object.assign({}, o.d[String(jstDateKey(ms))] || {}); },
    // 期間中の合計（この端末だけ）
    local: function (days, ms) {
      var o = plays.raw(), end = jstDateKey(ms), start = addDays(end, -(Math.max(1, days || 7) - 1)), tot = {};
      Object.keys(o.d).forEach(function (k) {
        if (Number(k) < start || Number(k) > end) return;
        Object.keys(o.d[k]).forEach(function (g) { tot[g] = (tot[g] || 0) + finite(o.d[k][g], 0); });
      });
      return tot;
    },
    // まだ送っていない（日, ゲーム）。送るのは今日と、境目の猶予のための昨日だけ
    pending: function (ms) {
      var o = plays.raw(), today = jstDateKey(ms), out = [];
      [addDays(today, -1), today].forEach(function (k) {
        var d = o.d[String(k)] || {}, s = o.sent[String(k)] || {};
        Object.keys(d).forEach(function (g) {
          if (d[g] > 0 && !s[g]) out.push({ dateKey: k, week: 'w' + jstWeekKey(jstDayStart(k)), game: g });
        });
      });
      return out;
    },
    markSent: function (dateKey, id) {
      var o = plays.raw(), k = String(dateKey), s = isObj(o.sent[k]) ? o.sent[k] : {};
      s[id] = 1; o.sent[k] = s; store.set(KEYS.plays, o);
    },
    week: jstWeekKey,
  };

  // ------------------------------------------------------------------ daily  kobo.daily = { YYYYMMDD: { game: { best, tries, clearedAt } } }
  var daily = {
    get: function (dateKey, id) {
      var all = getObj(KEYS.daily);
      if (dateKey == null) return all;
      var d = all[String(dateKey)] || {};
      return id ? (d[id] || null) : d;
    },
    // score は「大きいほど良い」値（SYSTEM_ARCHITECTURE.md 6章の順位の値）
    record: function (id, dateKey, r) {
      var g = game(id); if (!g || !isDateKey(dateKey)) return null;
      r = r || {};
      var all = getObj(KEYS.daily), k = String(dateKey), day = isObj(all[k]) ? all[k] : {};
      var cur = isObj(day[id]) ? day[id] : { best: 0, tries: 0, clearedAt: 0 };
      var s = finite(r.score, 0);
      cur.tries = finite(cur.tries, 0) + 1;
      if (r.cleared !== false && s > finite(cur.best, 0)) cur.best = s;
      if (r.cleared && !(finite(cur.clearedAt, 0) > 0)) cur.clearedAt = Math.round(finite(r.at, now()));
      day[id] = cur; all[k] = day;
      store.set(KEYS.daily, pruneDaily(all, { now: now() }));
      return cur;
    },
    seed: dailySeed,
  };

  // ------------------------------------------------------------------ migrations
  // MIGRATIONS = [{ id, v, run(ctx) }]。終わったものは kobo.migrated = { id: 時刻 } に記録し、1回だけ実行する。
  // run は何度動いても結果が同じになるように書く（途中で止まっても、次に最初からやり直せるように）。古いキーは消さない。
  // run が例外を投げたら記録しない（次のページで再挑戦）。false を返したら「まだ条件がそろわない」として記録しない。
  var MIGRATIONS = [];
  var migrations = {
    list: MIGRATIONS,
    add: function (m) {
      if (!m || typeof m.id !== 'string' || typeof m.run !== 'function') throw new Error('KoboPlatform.migrations.add: { id, run } required');
      for (var i = 0; i < MIGRATIONS.length; i++) if (MIGRATIONS[i].id === m.id) return false;
      MIGRATIONS.push({ id: m.id, v: finite(m.v, 0), run: m.run });
      MIGRATIONS.sort(function (a, b) { return a.v - b.v; });
      return true;
    },
    done: function (id) { return finite(getObj(KEYS.migrated)[id], 0) > 0; },
    run: function () {
      var rec = getObj(KEYS.migrated), result = { ran: [], failed: [], skipped: [] };
      var ctx = { store: store, now: now(), jstDateKey: jstDateKey };
      MIGRATIONS.forEach(function (m) {
        if (finite(rec[m.id], 0) > 0) { result.skipped.push(m.id); return; }
        try {
          var r = m.run(ctx);
          if (r === false) { result.failed.push(m.id); return; }
          rec = getObj(KEYS.migrated); rec[m.id] = now(); store.set(KEYS.migrated, rec);
          result.ran.push(m.id);
        } catch (e) { result.failed.push(m.id); if (root.console) console.warn('KoboPlatform migration', m.id, e); }
      });
      return result;
    },
    // 途切れずに終わっている最大の v（データの形のバージョン）
    version: function () {
      var rec = getObj(KEYS.migrated), v = 0;
      for (var i = 0; i < MIGRATIONS.length; i++) { if (!(finite(rec[MIGRATIONS[i].id], 0) > 0)) break; v = Math.max(v, MIGRATIONS[i].v); }
      return v;
    },
  };

  // ------------------------------------------------------------------ launch params
  function launch(search) {
    if (search == null) { try { search = root.location ? root.location.search : ''; } catch (e) { search = ''; } }
    var q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      try { q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
    });
    var out = { daily: null, stage: null, code: null };
    if (q.daily != null) {
      var today = jstDateKey();
      // 未来の日付は今日にする（デイリーの答えを先に見られないように）。日付がない ?daily は今日
      out.daily = isDateKey(q.daily) && Number(q.daily) <= today ? Number(q.daily) : today;
    }
    if (q.stage != null && /^\d{1,6}$/.test(q.stage) && Number(q.stage) >= 1) out.stage = Number(q.stage);
    if (q.code != null && q.code.length > 0 && q.code.length <= 4096 && /^[A-Za-z0-9:_\-.]+$/.test(q.code)) out.code = q.code;
    return out;
  }

  // ------------------------------------------------------------------ misc
  function rankable(mode) { return mode === 'normal' || mode === 'daily'; }
  var fx = {
    reducedMotion: function () { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } },
    vibrate: function (p) { try { if (!fx.reducedMotion() && root.navigator && root.navigator.vibrate) root.navigator.vibrate(p); } catch (e) {} },
  };
  // テーマ：kobo.theme（'system' | 'light' | 'dark'）→ html[data-kb-theme]。色そのものは theme.css（P1-3）
  var THEME_COLOR = { dark: '#1d2a35', light: '#f4f1ea' };
  var theme = {
    get: function () { var t = store.get(KEYS.theme, 'system'); return t === 'light' || t === 'dark' ? t : 'system'; },
    resolved: function () {
      var t = theme.get(); if (t !== 'system') return t;
      try { return root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { return 'dark'; }
    },
    apply: function () {
      var doc = root.document; if (!doc || !doc.documentElement) return null;
      var r = theme.resolved();
      try {
        doc.documentElement.setAttribute('data-kb-theme', r);
        // theme-color は、ページが <meta name="theme-color" data-kb-theme-color> で頼んだときだけ書き換える（ゲームの色を勝手に変えない）
        var m = doc.querySelector && doc.querySelector('meta[name="theme-color"][data-kb-theme-color]');
        if (m && m.setAttribute) m.setAttribute('content', THEME_COLOR[r]);
      } catch (e) {}
      return r;
    },
    set: function (t) { store.set(KEYS.theme, t === 'light' || t === 'dark' ? t : 'system'); return theme.apply(); },
  };

  // ------------------------------------------------------------------ event processing
  // ゲームのイベントから、履歴・統計・プレイ回数・デイリーを更新する。XP と実績は P3-1、ランキングの送信は rank.js。
  // mode: 'versus' は履歴と統計だけ（ランキングとデイリーには入れない）。'practice' は何も記録しない。
  var sessions = {};
  function clampDur(v) { return Math.max(0, Math.min(DAY, Math.round(finite(v, 0)))); }
  on('play_start', function (p) {
    if (!game(p.game)) return;
    var mode = MODES.indexOf(p.mode) >= 0 ? p.mode : 'normal', t = Math.round(finite(p.t, now()));
    sessions[p.game] = { t: t, mode: mode, clears: 0, best: false, stage: p.stage,
      dateKey: mode === 'daily' ? (isDateKey(p.dateKey) ? Number(p.dateKey) : jstDateKey(t)) : null };
    if (mode !== 'practice') plays.count(p.game, t);
  });
  on('stage_clear', function (p) {
    if (!game(p.game)) return;
    var s = sessions[p.game];
    if (s) { s.clears++; if (s.mode === 'practice') return; }
    stats.record(p.game, { clears: 1 });
  });
  on('best', function (p) { var s = sessions[p.game]; if (s) s.best = true; });
  on('play_end', function (p) {
    if (!game(p.game)) return;
    var s = sessions[p.game] || null, t = now();
    delete sessions[p.game];
    var mode = MODES.indexOf(p.mode) >= 0 ? p.mode : (s ? s.mode : 'normal');
    if (mode === 'practice') return;
    var start = s ? s.t : t - clampDur(p.durationMs);
    var dur = p.durationMs != null ? clampDur(p.durationMs) : clampDur(t - start);
    var score = Math.max(0, finite(p.score, 0));
    var entry = history.add({ g: p.game, t: start, d: dur, s: score, m: mode, st: p.stage });
    var clearsHere = s ? s.clears : 0;
    stats.record(p.game, { plays: 1, ms: dur, clears: (p.reason === 'clear' && !clearsHere) ? 1 : 0 });
    var dailyRec = null;
    if (mode === 'daily') {
      var dk = isDateKey(p.dateKey) ? Number(p.dateKey) : (s && s.dateKey) || jstDateKey(start);
      // 'quit' はやめただけ（挑戦の回数には数え、記録には入れない）。'over' と 'clear' は最後まで遊んだ
      dailyRec = daily.record(p.game, dk, { score: score, cleared: p.reason !== 'quit', at: t });
    }
    emit('played', { game: p.game, mode: mode, entry: entry, daily: dailyRec, best: !!(s && s.best), rankable: rankable(mode) });
  });

  // ------------------------------------------------------------------ export
  var KoboPlatform = {
    version: VERSION, KEYS: KEYS, MODES: MODES.slice(), MIGRATIONS: MIGRATIONS,
    store: store,
    on: on, off: off, once: once, emit: emit,
    jstDateKey: jstDateKey, jstWeekKey: jstWeekKey, jstParts: jstParts, jstDayStart: jstDayStart, addDays: addDays,
    daysBetween: daysBetween, isDateKey: isDateKey,
    hash32: hash32, xmur3: xmur3, rng: rng, dailySeed: dailySeed,
    devId: devId,
    history: history, fav: fav, stats: stats, plays: plays, daily: daily, migrations: migrations,
    merge: merge, syncMap: syncMap, PLATFORM_SYNC: PLATFORM_SYNC,
    rankValue: rankValue, recordValue: recordValue, recordText: recordText,
    game: game, games: games, genres: genres, launch: launch, rankable: rankable, fx: fx, theme: theme,
    _sessions: sessions,
  };
  root.KoboPlatform = KoboPlatform;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboPlatform;

  // <head> で読まれたとき、画面がちらつかないうちにテーマを当てる
  theme.apply();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
