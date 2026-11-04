// ひまつぶし工房：アプリ内のお知らせ KoboNews（P3-6。SYSTEM_ARCHITECTURE.md 14章）
// ---------------------------------------------------------------------------------
// お知らせの中身は common/news.json（オーナーが git で編集する）：
//   [{ id: 数値（新しいほど大きい。使い回さない）, date: 'YYYY-MM-DD', title: { ja, en }, body: { ja, en }, link?: 'profile/' など }]
// 既読：kobo.news.read = 読んだお知らせの最大の id（数値）。cloud.js が 'max' で同期する（KoboPlatform.PLATFORM_SYNC）。
// プッシュ通知はしない。通信もこのファイルの fetch だけ（Service Worker が保存するので、通信なしでも前に読んだものは出る）。
//
//   KoboNews.load(base?) → Promise<[entry]>（新しい順。形の正しくないものは外す。読めなければ []）
//   KoboNews.normalize(raw) → [entry] / lastRead() → 数値 / unread(list) → [entry] / hasUnread(list)
//   KoboNews.markRead(list) → 新しい既読の id / text(o, lang?) → その言語の文（なければ日本語）
// node のテストでは require() できる（localStorage は globalThis のもの）。
(function (root) {
  'use strict';
  var KEY = 'kobo.news.read';
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function lastRead() {
    var s = ls(), v = null;
    try { v = s ? s.getItem(KEY) : null; } catch (e) {}
    var n = Number(v == null ? 0 : (function () { try { return JSON.parse(v); } catch (e) { return v; } })());
    return isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function okText(o) { return isObj(o) && typeof o.ja === 'string' && o.ja.length > 0; }
  function normalize(raw) {
    var list = Array.isArray(raw) ? raw : (isObj(raw) && Array.isArray(raw.news) ? raw.news : []);
    var seen = {}, out = [];
    list.forEach(function (e) {
      if (!isObj(e)) return;
      var id = Number(e.id);
      if (!(id > 0) || Math.floor(id) !== id || seen[id] || !okText(e.title)) return;
      seen[id] = 1;
      var x = { id: id, date: typeof e.date === 'string' ? e.date : '', title: e.title, body: okText(e.body) ? e.body : { ja: '', en: '' } };
      // リンクはサイトの中だけ（相対パス）か https
      if (typeof e.link === 'string' && /^(?:[a-z0-9_\-./?#=&]+|https:\/\/[^\s"'<>]+)$/i.test(e.link) && !/^\/\//.test(e.link)) x.link = e.link;
      out.push(x);
    });
    out.sort(function (a, b) { return b.id - a.id; });
    return out;
  }
  function unread(list) { var r = lastRead(); return (list || []).filter(function (e) { return e.id > r; }); }
  function hasUnread(list) { return unread(list).length > 0; }
  function markRead(list) {
    var max = lastRead();
    (list || []).forEach(function (e) { if (e && e.id > max) max = e.id; });
    if (max > lastRead()) {
      var s = ls();
      try { if (s) s.setItem(KEY, String(max)); } catch (e) {}
    }
    return max;
  }
  function lang() { var I = root.KoboI18n; return I && I.lang === 'en' ? 'en' : 'ja'; }
  function text(o, l) { if (!isObj(o)) return ''; return o[l || lang()] || o.ja || ''; }
  function load(base) {
    if (typeof root.fetch !== 'function') return Promise.resolve([]);
    var url = (base == null ? '' : base) + 'common/news.json';
    return root.fetch(url, { cache: 'no-cache' })
      .then(function (r) { return r && r.ok ? r.json() : []; })
      .then(normalize, function () { return []; });
  }

  var KoboNews = { KEY: KEY, load: load, normalize: normalize, lastRead: lastRead, unread: unread, hasUnread: hasUnread, markRead: markRead, text: text };
  root.KoboNews = KoboNews;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboNews;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
