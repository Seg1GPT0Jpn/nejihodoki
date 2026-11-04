// ひまつぶし工房：自分のデータの書き出しと削除 KoboAccount（P3-2。PRD P-8）
// ---------------------------------------------------------------------------------
// 読み込み：games.js・platform.js・cloud.js のあと（rank.js・friends.js があれば使う）。node のテストでは require() できる。
//
//   KoboAccount.localKeys() → この端末にある、ひまつぶし工房のキー（kobo.* / kusoge.* / nejihodoki3d.*）
//   KoboAccount.exportData() → { app, v, at, uid, data: { key: 文字列 } }   / download()（JSON のファイルを保存させる）
//   KoboAccount.cloudTargets(uid) → 消す文書のパスの一覧（下の順番）
//   KoboAccount.erase({ cloud }) → Promise<{ ok, deleted: [path], failed: [{ path, code }], local: 消したキーの数, account }>
//
// 消すもの（firestore.rules で本人が消せるものだけ。ルールの変更は要らない）：
//   1. kbCodes/{自分のコード}（kobo.profile.code。そのコードが自分の uid のとき）
//   2. kbBoards/{board}/e/{uid}：この端末が送ったボード（kobo.rankSent）と、全部のゲームの 通算・今週・今日・今日のチャレンジ
//      （過去の週・日のボードは、一覧を読めないので探せない。それらはもう表示されない期間のもの）
//   3. kbProfiles/{uid}、kusogeRanks/{uid}
//   4. nejiUsers/{uid}（最後。途中で失敗しても、同期のデータが先に消えて半端にならないように）
//   そのあとアカウントを消す（currentUser.delete()。Google で「最近ログインしていない」と断られたらログアウトだけ）。
//   最後に端末のキーを消す（言語 kobo.lang とテーマ kobo.theme は残す）。cloud.js の同期はログアウトのあとなので、もう送らない。
(function (root) {
  'use strict';

  var PREFIX = /^(kobo\.|kusoge\.|nejihodoki3d\.)/;
  var KEEP = { 'kobo.lang': 1, 'kobo.theme': 1 };
  var LAST = { 'kobo.mtime': 1, 'kobo.syncedUid': 1 }; // cloud.js が消すたびに書き直すので、最後に消す
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };

  var env = {
    now: function () { return Date.now(); },
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
    auth: function () { try { return root.firebase && root.firebase.auth ? root.firebase.auth() : null; } catch (e) { return null; } },
  };

  function st() { return env.storage(); }
  function localKeys() {
    var s = st(), out = [];
    if (!s) return out;
    try { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && PREFIX.test(k)) out.push(k); } } catch (e) {}
    return out.sort();
  }
  function getJSON(k) { var s = st(); try { var v = s ? s.getItem(k) : null; return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
  function uid() { var C = env.cloud(); try { var u = C && C.user ? C.user() : null; return u && u.uid ? u.uid : (C && C.me ? C.me() : null); } catch (e) { return null; } }

  function exportData() {
    var s = st(), data = {};
    localKeys().forEach(function (k) { try { data[k] = s.getItem(k); } catch (e) {} });
    return { app: 'himatsubushi-kobo', v: 1, at: new Date(env.now()).toISOString(), uid: uid() || null, data: data };
  }
  function download() {
    var doc = root.document; if (!doc || !root.Blob || !root.URL) return false;
    var d = exportData(), blob = new root.Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
    var a = doc.createElement('a'), url = root.URL.createObjectURL(blob);
    a.href = url; a.download = 'himatsubushi-kobo-' + d.at.slice(0, 10) + '.json';
    doc.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { root.URL.revokeObjectURL(url); } catch (e) {} }, 4000);
    return true;
  }

  function boards() {
    var out = {}, R = root.KoboRank, reg = root.KOBO_REGISTRY, P = root.KoboPlatform, t = env.now();
    var sent = getJSON('kobo.rankSent');
    if (isObj(sent) && isObj(sent.b) && (!sent.uid || sent.uid === uid())) Object.keys(sent.b).forEach(function (b) { out[b] = 1; });
    var ids = R && R.rankGames ? R.rankGames().map(function (g) { return g.id; })
      : reg && reg.games ? reg.games.filter(function (g) { return g.rankSource; }).map(function (g) { return g.id; }) : [];
    var wk = P && P.jstWeekKey ? P.jstWeekKey(t) : null, dk = P && P.jstDateKey ? P.jstDateKey(t) : null;
    ids.forEach(function (g) {
      out[g + '~all'] = 1;
      if (wk != null) out[g + '~w' + wk] = 1;
      if (dk != null) { out[g + '~d' + dk] = 1; out[g + '~c' + dk] = 1; }
    });
    return Object.keys(out).filter(function (b) { return /^[a-z0-9]+~(all|w\d{1,6}|[dc]\d{8})$/.test(b); }).sort();
  }
  function cloudTargets(u) {
    u = u || uid(); if (!u) return [];
    var list = [], prof = getJSON('kobo.profile');
    if (isObj(prof) && /^[2-9A-HJ-NP-Z]{8}$/.test(prof.code || '') && (!prof.codeU || prof.codeU === u)) list.push('kbCodes/' + prof.code);
    boards().forEach(function (b) { list.push('kbBoards/' + b + '/e/' + u); });
    list.push('kbProfiles/' + u, 'kusogeRanks/' + u, 'nejiUsers/' + u);
    return list;
  }
  function ref(db, path) {
    var p = path.split('/'), r = db.collection(p[0]).doc(p[1]);
    for (var i = 2; i < p.length; i += 2) r = r.collection(p[i]).doc(p[i + 1]);
    return r;
  }

  var busy = null;
  function erase(opt) {
    opt = opt || {};
    if (busy) return busy;
    var res = { ok: true, deleted: [], failed: [], local: 0, account: 'none' };
    var u = uid();
    var step = Promise.resolve();
    if (opt.cloud !== false && u) {
      step = env.db().then(function (db) {
        if (!db) { res.ok = false; res.failed.push({ path: '*', code: 'unavailable' }); return; }
        var chain = Promise.resolve();
        cloudTargets(u).forEach(function (path) {
          chain = chain.then(function () {
            return Promise.resolve(ref(db, path).delete()).then(function () { res.deleted.push(path); }, function (e) {
              var code = (e && e.code) || 'error';
              res.failed.push({ path: path, code: code });
              // the code may already be gone (or made by an older build): that is not a failure of the deletion
              if (!/^kbCodes\//.test(path)) res.ok = false;
            });
          });
        });
        return chain;
      }).then(function () {
        var a = env.auth(), cur = a && a.currentUser;
        if (!cur || cur.uid !== u) return;
        return Promise.resolve(cur.delete()).then(function () { res.account = 'deleted'; }, function (e) {
          res.accountError = (e && e.code) || 'error';
          return Promise.resolve(a.signOut()).then(function () { res.account = 'signedOut'; }, function () { res.account = 'kept'; });
        });
      });
    }
    busy = step.then(function () {
      if (opt.cloud !== false && u && !res.ok) return res; // keep this device's copy when the cloud could not be cleared
      var s = st(), keys = localKeys().filter(function (k) { return !KEEP[k]; });
      keys.sort(function (a, b) { return (LAST[a] ? 1 : 0) - (LAST[b] ? 1 : 0); });
      keys.forEach(function (k) { try { s.removeItem(k); res.local++; } catch (e) {} });
      Object.keys(LAST).forEach(function (k) { try { s.removeItem(k); } catch (e) {} });
      try { if (root.sessionStorage) Object.keys(root.sessionStorage).forEach(function (k) { if (PREFIX.test(k)) root.sessionStorage.removeItem(k); }); } catch (e) {}
      return res;
    }).then(function (r) { busy = null; return r; }, function (e) { busy = null; res.ok = false; res.failed.push({ path: '*', code: (e && e.code) || 'error' }); return res; });
    return busy;
  }

  var KoboAccount = { localKeys: localKeys, exportData: exportData, download: download, cloudTargets: cloudTargets, erase: erase, KEEP: KEEP,
    _env: function (o) { Object.assign(env, o || {}); return env; } };
  root.KoboAccount = KoboAccount;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboAccount;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
