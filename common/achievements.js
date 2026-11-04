// ひまつぶし工房：実績と称号と公開プロフィール KoboAchievements（P3-1・P3-3。SYSTEM_ARCHITECTURE.md 4章・5章）
// ---------------------------------------------------------------------------------
// 読み込み：platform.js が同じフォルダから自動で読み込む（ページに <script src="../common/achievements.js"> があればそれを使う）。
//           games.js・platform.js のあと。platform.js がなければ何もしない。node のテストでは require() できる。
// 実績の定義：全体の実績はこのファイルの GLOBAL、ゲームごとの実績は登録簿（common/games.js）の games[i].achievements。
//   どのゲームにも「はじめての○○」（<game>.first）を自動で足す（初めて遊んだときの XP を、端末をまたいで1回だけにするため）。
//   1件 = { id（24文字まで。称号の id にもなる）, game: null | id, tier: 1〜4, xp?（省略時は tier から 10/25/50/100）,
//           icon（KoboUI.icon の名前）, hidden?, title: { ja, en }, desc: { ja, en }, grantsTitle?: { ja, en }, when: 条件 }
//   条件（when）：宣言で書く。
//     { rec: { key, path | paths, agg: 'first' | 'max', each?, measure?, min?, offset? }, gte }   保存されている記録
//         measure: 'value'（既定）| 'count'（配列の長さ・キーの数）| 'sum'（合計）| 'max'（最大）| 'countGte'（min 以上の数）
//         each: 中の各要素のフィールド名（例：heroes の各ヒーローの lv）
//     { stat: 名前, gte }    plays / ms / clears / played（そのゲーム）、totalPlays / totalMs / distinctGames / dailyClears /
//                            dailyStreak / dailyAllOneDay / gameDaily / level / achCount / vsPlays / vsWins / gameAch（genre か全部で各3個以上）
//         gte: 'allGames' | 'allDaily' はゲームの数・デイリーのあるゲームの数
//     { ev: 'play_end' | 'stage_clear' | 'progress', field?, gte?, key?, modes?, hourFrom?, hourTo? }  ゲームのイベント
//         play_end の score / durationMs / 時刻は、履歴（kobo.history）からさかのぼって判定する
//     { any: [条件…] } / { all: [条件…] }
// 記録：kobo.ach = { id: 取った時刻 }（和集合、時刻は早い方）。XP は KoboPlatform.xp.grantAchievement が kobo.xp.a に記録する。
//   さかのぼり（前からの記録で取れた実績）は kobo.xp.r にも印を付け、今週の XP には入れない。
//   判定は決まった順番で、取った実績は二度と取らない（同じ記録から何度判定しても同じ結果）。
//
//   KoboAchievements.all() / def(id) / forGame(id) / global() / unlocked() / has(id) / progress(id) → { value, goal, done }
//   KoboAchievements.evaluate({ event, type, live }) → 新しく取った実績の配列 / retro() / summary()
//   KoboAchievements.name(def, lang?) / desc(def, lang?)（hidden で未取得なら「？？？」）
//   KoboAchievements.titles() / title() / setTitle(id) / titleText(id, lang?)   称号（ランクの名前と、実績の grantsTitle）
//   KoboAchievements.toast(idOrDef) / toastLevel(lv) / toasts(on)   KoboUI のトースト（toasts(false) で自動のトーストを止める）
//   KoboAchievements.on(f) → off()     実績を取ったとき f({ id, def, retro, xp })（KoboPlatform の 'achievement' イベントと同じ）
//   KoboAchievements.profile.publish({ force }) / schedule() / status() / payload()
//        公開プロフィール kbProfiles/{uid} = { n, lv, xpw, wk, t, icon?, title? }。1台で1日4回まで、30分以上あける（ルールは60秒）
(function (root) {
  'use strict';

  var VERSION = 1;
  var P = function () { return root.KoboPlatform || null; };
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var finite = function (v, d) { var n = Number(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
  var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var TIER_XP = { 1: 10, 2: 25, 3: 50, 4: 100 };
  var RETRO_ID = 'ach-retro-1';
  var KEYS = { ach: 'kobo.ach', profile: 'kobo.profile', nick: 'kobo.nick', sent: 'kobo.profSent', migrated: 'kobo.migrated' };

  var I = function () { return root.KoboI18n || null; };
  function lang() { var i = I(); return i && i.lang === 'en' ? 'en' : 'ja'; }
  function T(s, v) {
    var i = I(); if (i && i.t) return i.t(s, v);
    return v ? String(s).replace(/\{(\w+)\}/g, function (m, k) { return k in v ? v[k] : m; }) : s;
  }
  if (I() && I().add) I().add({ en: {
    '実績「{name}」を獲得！ +{xp} XP': 'Achievement unlocked: {name} (+{xp} XP)',
    'これまでの記録から、実績を {n} 個獲得しました（+{xp} XP）': 'Your existing records earned {n} achievements (+{xp} XP)',
    'ほかに {n} 個の実績を獲得': '{n} more achievements unlocked',
    'レベルアップ！ Lv{lv}（{rank}）': 'Level up! Lv{lv} ({rank})',
    '？？？': '???', 'ひみつの実績': 'Secret achievement',
  } });

  // ------------------------------------------------------------------ 全体の実績
  var GLOBAL = [
    { id: 'all.first', tier: 1, icon: 'play', title: { ja: 'はじめの一歩', en: 'First Step' }, desc: { ja: 'どれかのゲームを1回遊ぶ', en: 'Play any game once' }, when: { stat: 'distinctGames', gte: 1 } },
    { id: 'all.variety3', tier: 1, icon: 'globe', title: { ja: 'いろいろ遊び', en: 'Sampler' }, desc: { ja: '3種類のゲームを遊ぶ', en: 'Play 3 different games' }, when: { stat: 'distinctGames', gte: 3 } },
    { id: 'all.variety6', tier: 2, icon: 'globe', title: { ja: '寄り道じょうず', en: 'Explorer' }, desc: { ja: '6種類のゲームを遊ぶ', en: 'Play 6 different games' }, when: { stat: 'distinctGames', gte: 6 } },
    { id: 'all.varietyAll', tier: 3, icon: 'globe', title: { ja: '工房めぐり', en: 'Workshop Tour' }, desc: { ja: '全部のゲームを遊ぶ', en: 'Play every game' }, when: { stat: 'distinctGames', gte: 'allGames' } },
    { id: 'all.plays10', tier: 1, icon: 'play', title: { ja: 'ひまつぶし入門', en: 'Getting Started' }, desc: { ja: '合わせて10回遊ぶ', en: 'Play 10 times in total' }, when: { stat: 'totalPlays', gte: 10 } },
    { id: 'all.plays100', tier: 2, icon: 'play', title: { ja: '常連プレイヤー', en: 'Regular Player' }, desc: { ja: '合わせて100回遊ぶ', en: 'Play 100 times in total' }, when: { stat: 'totalPlays', gte: 100 } },
    { id: 'all.plays500', tier: 3, icon: 'play', title: { ja: '工房の常連さん', en: 'Workshop Regular' }, desc: { ja: '合わせて500回遊ぶ', en: 'Play 500 times in total' }, when: { stat: 'totalPlays', gte: 500 }, grantsTitle: { ja: '常連さん', en: 'Regular' } },
    { id: 'all.time1h', tier: 1, icon: 'restart', title: { ja: 'ひとやすみ1時間', en: 'One Hour In' }, desc: { ja: '合わせて1時間遊ぶ', en: 'Play for 1 hour in total' }, when: { stat: 'totalMs', gte: 3600000 } },
    { id: 'all.time10h', tier: 3, icon: 'restart', title: { ja: 'じっくり10時間', en: 'Ten Hours' }, desc: { ja: '合わせて10時間遊ぶ', en: 'Play for 10 hours in total' }, when: { stat: 'totalMs', gte: 36000000 } },
    { id: 'all.daily1', tier: 1, icon: 'star', title: { ja: '挑戦者', en: 'Challenger' }, desc: { ja: '今日のチャレンジを1回クリア', en: 'Clear a daily challenge' }, when: { stat: 'dailyClears', gte: 1 } },
    { id: 'all.daily30', tier: 3, icon: 'star', title: { ja: '挑戦状あつめ', en: 'Challenge Collector' }, desc: { ja: '今日のチャレンジを合わせて30回クリア', en: 'Clear 30 daily challenges' }, when: { stat: 'dailyClears', gte: 30 } },
    { id: 'all.streak3', tier: 2, icon: 'star', title: { ja: '3日つづけて', en: 'Three in a Row' }, desc: { ja: '3日つづけて今日のチャレンジをクリア', en: 'Clear a daily challenge 3 days in a row' }, when: { stat: 'dailyStreak', gte: 3 } },
    { id: 'all.streak7', tier: 3, icon: 'star', title: { ja: '毎日の人', en: 'Daily Regular' }, desc: { ja: '7日つづけて今日のチャレンジをクリア', en: 'Clear a daily challenge 7 days in a row' }, when: { stat: 'dailyStreak', gte: 7 }, grantsTitle: { ja: '毎日の人', en: 'Daily Regular' } },
    { id: 'all.dailyAll', tier: 3, icon: 'trophy', title: { ja: '挑戦状ぜんぶ', en: 'Full Daily Sweep' }, desc: { ja: '1日で、デイリーのある全部のゲームをクリア', en: 'Clear every daily challenge on the same day' }, when: { stat: 'dailyAllOneDay', gte: 'allDaily' } },
    { id: 'all.vs1', tier: 1, icon: 'globe', title: { ja: 'はじめての対戦', en: 'First Match' }, desc: { ja: 'オンライン対戦を1回遊ぶ', en: 'Play an online match' }, when: { stat: 'vsPlays', gte: 1 } },
    { id: 'all.vsWin10', tier: 2, icon: 'trophy', title: { ja: '対戦じょうず', en: 'Match Winner' }, desc: { ja: 'オンライン対戦で合わせて10回勝つ', en: 'Win 10 online matches' }, when: { stat: 'vsWins', gte: 10 } },
    { id: 'all.lv10', tier: 2, icon: 'star', title: { ja: '腕だめし', en: 'Level 10' }, desc: { ja: 'レベル10になる', en: 'Reach level 10' }, when: { stat: 'level', gte: 10 } },
    { id: 'all.lv30', tier: 3, icon: 'star', title: { ja: '名人への道', en: 'Level 30' }, desc: { ja: 'レベル30になる', en: 'Reach level 30' }, when: { stat: 'level', gte: 30 } },
    { id: 'all.ach10', tier: 2, icon: 'trophy', title: { ja: '実績コレクター', en: 'Collector' }, desc: { ja: '実績を10個集める', en: 'Unlock 10 achievements' }, when: { stat: 'achCount', gte: 10 } },
    { id: 'all.ach50', tier: 3, icon: 'trophy', title: { ja: '実績マニア', en: 'Completionist' }, desc: { ja: '実績を50個集める', en: 'Unlock 50 achievements' }, when: { stat: 'achCount', gte: 50 } },
    { id: 'all.puzzle', tier: 3, icon: 'trophy', title: { ja: 'パズルマスター', en: 'Puzzle Master' }, desc: { ja: 'パズルのゲーム全部で、実績を3個ずつ集める', en: 'Unlock 3 achievements in every puzzle game' }, when: { stat: 'gameAch', genre: 'puzzle', gte: 3 }, grantsTitle: { ja: 'パズルマスター', en: 'Puzzle Master' } },
    { id: 'all.master', tier: 4, icon: 'trophy', title: { ja: '工房の達人', en: 'Workshop Virtuoso' }, desc: { ja: '全部のゲームで、実績を3個ずつ集める', en: 'Unlock 3 achievements in every game' }, when: { stat: 'gameAch', gte: 3 }, grantsTitle: { ja: '工房の達人', en: 'Workshop Virtuoso' } },
    { id: 'all.night', tier: 1, icon: 'theme', hidden: true, title: { ja: '夜ふかし', en: 'Night Owl' }, desc: { ja: '夜中の2時〜5時（日本時間）に遊び終える', en: 'Finish a game between 2 and 5 a.m. (Japan time)' }, when: { ev: 'play_end', hourFrom: 2, hourTo: 5, modes: ['normal', 'daily', 'versus'] } },
    { id: 'all.marathon', tier: 2, icon: 'restart', hidden: true, title: { ja: 'ぶっ通し', en: 'Marathon' }, desc: { ja: '1回で30分以上遊ぶ', en: 'Play a single game for 30 minutes or more' }, when: { ev: 'play_end', field: 'durationMs', gte: 1800000, modes: ['normal', 'daily'] } },
  ];

  // ------------------------------------------------------------------ 定義の一覧
  var cache = null;
  function reg() { return root.KOBO_REGISTRY || null; }
  function gamesList() { var r = reg(); return r ? r.games : []; }
  function firstDef(g) {
    var s = g.short || g.title || { ja: g.id, en: g.id };
    return { id: g.id + '.first', game: g.id, tier: 1, icon: 'play', auto: true,
      title: { ja: 'はじめての' + s.ja, en: 'First ' + s.en }, desc: { ja: s.ja + 'を初めて遊ぶ', en: 'Play ' + s.en + ' for the first time' },
      when: { stat: 'played', gte: 1 } };
  }
  function normalize(d, gameId) {
    var o = Object.assign({}, d);
    o.game = gameId || d.game || null;
    o.tier = Math.max(1, Math.min(4, Math.floor(finite(d.tier, 1))));
    o.xp = d.xp != null ? Math.max(0, Math.round(finite(d.xp, 0))) : TIER_XP[o.tier];
    o.hidden = !!d.hidden;
    return o;
  }
  function all() {
    if (cache && cache.reg === reg() && cache.n === gamesList().length) return cache.list;
    var list = GLOBAL.map(function (d) { return normalize(d, null); }), byId = {};
    gamesList().forEach(function (g) {
      list.push(normalize(firstDef(g), g.id));
      (Array.isArray(g.achievements) ? g.achievements : []).forEach(function (d) { list.push(normalize(d, g.id)); });
    });
    list = list.filter(function (d) { if (!d || typeof d.id !== 'string' || byId[d.id]) return false; byId[d.id] = d; return true; });
    cache = { reg: reg(), n: gamesList().length, list: list, byId: byId };
    return list;
  }
  function def(id) { all(); return hasOwn(cache.byId, id) ? cache.byId[id] : null; }
  function forGame(id) { return all().filter(function (d) { return d.game === id; }); }
  function global() { return all().filter(function (d) { return !d.game; }); }

  // ------------------------------------------------------------------ 記録の読み方
  function store() { var p = P(); return p ? p.store : null; }
  function unlocked() { var s = store(); var o = s ? s.get(KEYS.ach, {}) : {}; return isObj(o) ? o : {}; }
  function has(id) { return finite(unlocked()[id], 0) > 0; }
  function parse(raw) { if (raw == null) return undefined; try { return JSON.parse(raw); } catch (e) { var n = Number(raw); return isFinite(n) ? n : undefined; } }
  function at(o, path) {
    if (path == null || path === '') return o;
    var p = String(path).split('.');
    for (var i = 0; i < p.length; i++) { if (o == null || typeof o !== 'object') return undefined; o = o[p[i]]; }
    return o;
  }
  function numOf(v) { if (typeof v === 'number' && isFinite(v)) return v; if (typeof v === 'string' && v !== '' && isFinite(Number(v))) return Number(v); return undefined; }
  function entries(v) { return Array.isArray(v) ? v : isObj(v) ? Object.keys(v).map(function (k) { return v[k]; }) : []; }
  function measure(v, rec) {
    var m = rec.measure || 'value';
    if (m === 'value') return numOf(v);
    if (v == null || typeof v !== 'object') return m === 'count' ? 0 : numOf(v);
    var es = entries(v);
    if (m === 'count') return es.length;
    var nums = es.map(function (e) { return numOf(rec.each ? at(e, rec.each) : e); }).filter(function (x) { return x !== undefined; });
    if (m === 'sum') return nums.reduce(function (a, b) { return a + b; }, 0);
    if (m === 'max') return nums.length ? Math.max.apply(null, nums) : 0;
    if (m === 'countGte') return nums.filter(function (x) { return x >= finite(rec.min, 1); }).length;
    return undefined;
  }
  function recValue(rec, ctx) {
    var o = ctx.json(rec.key);
    if (o === undefined) return 0;
    var paths = rec.paths || [rec.path == null ? null : rec.path], out;
    for (var i = 0; i < paths.length; i++) {
      var x = measure(at(o, paths[i]), rec);
      if (x === undefined) continue;
      if (rec.agg === 'max') out = out === undefined ? x : Math.max(out, x);
      else { out = x; break; }
    }
    return out === undefined ? 0 : out + finite(rec.offset, 0);
  }

  // ------------------------------------------------------------------ 判定の材料（1回の判定の間だけ覚えておく）
  function makeCtx(opt) {
    var p = P(), s = p.store, raws = {}, memo = {};
    var ctx = {
      now: opt.now != null ? opt.now : Date.now(),
      event: opt.event || null, type: opt.type || null,
      raw: function (k) { if (!hasOwn(raws, k)) raws[k] = s.raw(k); return raws[k]; },
      json: function (k) { return parse(ctx.raw(k)); },
      memo: function (k, f) { if (!hasOwn(memo, k)) memo[k] = f(); return memo[k]; },
      ach: unlocked(),
    };
    return ctx;
  }
  function historyOf(ctx) { return ctx.memo('hist', function () { return P().history.list(); }); }
  function statsOf(ctx, id) { return ctx.memo('st:' + id, function () { return P().stats.get(id); }); }
  function playedGame(ctx, id) {
    return ctx.memo('pl:' + id, function () {
      var p = P();
      if (statsOf(ctx, id).plays > 0) return true;
      if (historyOf(ctx).some(function (e) { return e.g === id; })) return true;
      var getRaw = function (k) { return ctx.raw(k); };
      if (p.rankValue(id, getRaw) > 0) return true;
      return p.recordValue(id, getRaw) != null;
    });
  }
  // kobo.daily と、ネジほどきの古いデイリー（nejihodoki3d.daily = { YYYYMMDD: 星 }）から、クリアした (日, ゲーム)
  function dailyClears(ctx) {
    return ctx.memo('daily', function () {
      var p = P(), all = p.daily.get(), set = {};
      Object.keys(all).forEach(function (day) {
        if (!p.isDateKey(day) || !isObj(all[day])) return;
        Object.keys(all[day]).forEach(function (g) { if (isObj(all[day][g]) && finite(all[day][g].clearedAt, 0) > 0) set[day + '|' + g] = 1; });
      });
      var nd = ctx.json('nejihodoki3d.daily');
      if (isObj(nd)) Object.keys(nd).forEach(function (day) { if (p.isDateKey(day) && finite(nd[day], 0) > 0) set[day + '|neji'] = 1; });
      return Object.keys(set).map(function (k) { var a = k.split('|'); return { day: Number(a[0]), g: a[1] }; });
    });
  }
  function longestStreak(days) {
    var p = P(), u = {}, best = 0;
    days.forEach(function (d) { u[d] = 1; });
    Object.keys(u).forEach(function (d) {
      if (u[p.addDays(Number(d), -1)]) return; // 連続の始まりだけから数える
      var n = 0, k = Number(d);
      while (u[k]) { n++; k = p.addDays(k, 1); }
      if (n > best) best = n;
    });
    return best;
  }
  function vsTotals(ctx) {
    return ctx.memo('vs', function () {
      var o = ctx.json('kusoge.vs.stats'), plays = 0, wins = 0;
      if (isObj(o)) Object.keys(o).forEach(function (g) { if (isObj(o[g])) { plays += Math.max(0, finite(o[g].plays, 0)); wins += Math.max(0, finite(o[g].wins, 0)); } });
      var h = ctx.json('kusoge.hole.save'); // あなぼこシティは独自の対戦（online）
      if (isObj(h) && isObj(h.online)) { plays += Math.max(0, finite(h.online.plays, 0)); wins += Math.max(0, finite(h.online.wins, 0)); }
      return { plays: plays, wins: wins };
    });
  }
  function gameAchCount(ctx, id) {
    var n = 0;
    all().forEach(function (d) { if (d.game === id && !d.auto && finite(ctx.ach[d.id], 0) > 0) n++; });
    return n;
  }
  function goalOf(gte) {
    if (gte === 'allGames') return Math.max(1, gamesList().length);
    if (gte === 'allDaily') return Math.max(1, gamesList().filter(function (g) { return g.flags && g.flags.daily; }).length);
    return finite(gte, 1);
  }
  function statValue(w, d, ctx) {
    var p = P(), gid = w.game || d.game;
    switch (w.stat) {
      case 'plays': case 'ms': case 'clears': return gid ? statsOf(ctx, gid)[w.stat] : 0;
      case 'played': return gid && playedGame(ctx, gid) ? 1 : 0;
      case 'totalPlays': return p.games().reduce(function (a, g) { return a + statsOf(ctx, g.id).plays; }, 0);
      case 'totalMs': return p.games().reduce(function (a, g) { return a + statsOf(ctx, g.id).ms; }, 0);
      case 'distinctGames': return p.games().filter(function (g) { return playedGame(ctx, g.id); }).length;
      case 'dailyClears': return dailyClears(ctx).length;
      case 'gameDaily': return dailyClears(ctx).filter(function (x) { return x.g === gid; }).length;
      case 'dailyStreak': return longestStreak(dailyClears(ctx).map(function (x) { return x.day; }));
      case 'dailyAllOneDay': {
        var per = {}, best = 0, dg = {};
        p.games().forEach(function (g) { if (g.flags && g.flags.daily) dg[g.id] = 1; });
        dailyClears(ctx).forEach(function (x) { if (dg[x.g]) per[x.day] = (per[x.day] || 0) + 1; });
        Object.keys(per).forEach(function (k) { if (per[k] > best) best = per[k]; });
        return best;
      }
      case 'level': return p.xp ? p.xp.levelInfo(p.xp.total(ctx.now)).lv : 1;
      case 'achCount': return Object.keys(ctx.ach).filter(function (k) { return finite(ctx.ach[k], 0) > 0 && k !== d.id && def(k); }).length;
      case 'vsPlays': return vsTotals(ctx).plays;
      case 'vsWins': return vsTotals(ctx).wins;
      case 'gameAch': {
        var gs = p.games().filter(function (g) { return !w.genre || (g.genres || []).indexOf(w.genre) >= 0; });
        if (!gs.length) return 0;
        // 一番少ないゲームの数（全部のゲームで gte 個以上なら達成）
        return Math.min.apply(null, gs.map(function (g) { return gameAchCount(ctx, g.id); }));
      }
    }
    return 0;
  }
  function jstHour(ms) { return new Date(finite(ms, 0) + 9 * 3600000).getUTCHours(); }
  function inHours(w, ms) { var h = jstHour(ms); return w.hourFrom <= w.hourTo ? (h >= w.hourFrom && h < w.hourTo) : (h >= w.hourFrom || h < w.hourTo); }
  // イベントの条件。live のイベントと、履歴からのさかのぼり（play_end の score / durationMs / 時刻だけ）
  function evValue(w, d, ctx) {
    var modes = w.modes || ['normal', 'daily'], gid = d.game, best = 0, hit = false;
    var e = ctx.event, ty = ctx.type;
    var emode = e ? (e.mode || (ty !== 'play_end' && e.game && P()._sessions && P()._sessions[e.game] ? P()._sessions[e.game].mode : 'normal')) : null;
    if (e && ty === w.ev && (!gid || e.game === gid) && modes.indexOf(emode) >= 0 && (!w.key || e.key === w.key)) {
      if (w.hourFrom != null) { if (inHours(w, e.t != null ? e.t : ctx.now)) hit = true; }
      else {
        var v = numOf(w.field ? at(e, w.field) : (ty === 'progress' ? e.value : e.score));
        if (v !== undefined) best = Math.max(best, v);
        else if (w.gte == null) hit = true;
      }
    }
    if (w.ev === 'play_end' && (w.field === 'score' || w.field === 'durationMs' || w.field == null || w.hourFrom != null)) {
      historyOf(ctx).forEach(function (h) {
        if ((gid && h.g !== gid) || modes.indexOf(h.m || 'normal') < 0) return;
        if (w.hourFrom != null) { if (inHours(w, finite(h.t, 0) + finite(h.d, 0))) hit = true; return; }
        var v = w.field === 'durationMs' ? finite(h.d, 0) : finite(h.s, 0);
        if (v > best) best = v;
      });
    }
    if (w.hourFrom != null || w.gte == null) return hit ? 1 : 0;
    return best;
  }
  function condValue(w, d, ctx) {
    if (!isObj(w)) return 0;
    if (w.rec) return recValue(w.rec, ctx);
    if (w.stat) return statValue(w, d, ctx);
    if (w.ev) return evValue(w, d, ctx);
    return 0;
  }
  function condGoal(w) { return w.hourFrom != null || (w.ev && w.gte == null) ? 1 : goalOf(w.gte); }
  function test(w, d, ctx) {
    if (!isObj(w)) return false;
    if (Array.isArray(w.any)) return w.any.some(function (x) { return test(x, d, ctx); });
    if (Array.isArray(w.all)) return w.all.length > 0 && w.all.every(function (x) { return test(x, d, ctx); });
    return condValue(w, d, ctx) >= condGoal(w);
  }
  // 進み具合（プロフィールのページの表示用）。any は一番進んでいるもの、all は一番遅れているもの
  function progressOf(w, d, ctx) {
    if (Array.isArray(w.any) || Array.isArray(w.all)) {
      var ps = (w.any || w.all).map(function (x) { return progressOf(x, d, ctx); });
      var r = ps.map(function (x) { return x.goal ? Math.min(1, x.value / x.goal) : 0; });
      var i = w.any ? r.indexOf(Math.max.apply(null, r)) : r.indexOf(Math.min.apply(null, r));
      return ps[Math.max(0, i)] || { value: 0, goal: 1 };
    }
    return { value: condValue(w, d, ctx), goal: condGoal(w) };
  }

  // ------------------------------------------------------------------ 判定
  var busy = false, again = null, listeners = [];
  // opt: { event, type, live, now }。live = ゲームのイベントのあと（それ以外の判定はさかのぼり扱い）
  function evaluate(opt) {
    opt = opt || {};
    var p = P(); if (!p || !p.xp) return [];
    if (busy) { again = opt; return []; }
    busy = true;
    var got = [];
    try {
      for (var pass = 0; pass < 6; pass++) {
        var ctx = makeCtx(pass === 0 ? opt : { now: opt.now });
        var n = 0;
        all().forEach(function (d) {
          if (finite(ctx.ach[d.id], 0) > 0) return;
          var ok = false;
          try { ok = test(d.when, d, ctx); } catch (e) { if (root.console) console.warn('KoboAchievements', d.id, e); }
          if (!ok) return;
          var res = p.xp.grantAchievement(d.id, d.xp, { retro: !opt.live, t: ctx.now });
          if (!res) return;
          ctx.ach[d.id] = res.t; n++;
          var info = { id: d.id, def: d, retro: !opt.live, xp: d.xp, t: res.t };
          got.push(info);
        });
        if (!n) break;
      }
    } finally { busy = false; }
    got.forEach(function (info) {
      p.emit('achievement', info);
      listeners.slice().forEach(function (f) { try { f(info); } catch (e) {} });
    });
    if (got.length) queueToasts(got, opt);
    if (again) { var a = again; again = null; got = got.concat(evaluate(a)); }
    return got;
  }
  // 初めてこの端末で動いたとき、前からの記録で取れる実績を1回だけ判定する（さかのぼり。今週の XP には入れない）
  function retro(opt) {
    var p = P(); if (!p) return [];
    var got = evaluate({ live: false, now: opt && opt.now, first: !p.migrations.done(RETRO_ID) });
    if (!p.migrations.done(RETRO_ID)) {
      var rec = p.store.get(KEYS.migrated, {}); if (!isObj(rec)) rec = {};
      rec[RETRO_ID] = Date.now(); p.store.set(KEYS.migrated, rec);
    }
    return got;
  }
  function summary() {
    var u = unlocked(), list = all(), byGame = {}, count = 0, xp = 0;
    list.forEach(function (d) {
      var k = d.game || 'all'; byGame[k] = byGame[k] || { got: 0, total: 0 }; byGame[k].total++;
      if (finite(u[d.id], 0) > 0) { byGame[k].got++; count++; xp += d.xp; }
    });
    return { count: count, total: list.length, xp: xp, byGame: byGame };
  }
  function progress(id) {
    var d = def(id); if (!d || !P()) return null;
    var ctx = makeCtx({}), pr = progressOf(d.when, d, ctx);
    return { value: pr.value, goal: pr.goal, done: finite(ctx.ach[id], 0) > 0 };
  }
  function pick(o, l) { return o ? (o[l || lang()] || o.ja || '') : ''; }
  function name(d, l) { d = typeof d === 'string' ? def(d) : d; if (!d) return ''; return d.hidden && !has(d.id) ? T('？？？') : pick(d.title, l); }
  function desc(d, l) { d = typeof d === 'string' ? def(d) : d; if (!d) return ''; return d.hidden && !has(d.id) ? T('ひみつの実績') : pick(d.desc, l); }

  // ------------------------------------------------------------------ 称号
  function titles() {
    var p = P(); if (!p || !p.xp) return [];
    var lv = p.xp.info().lv, u = unlocked(), out = [];
    p.xp.RANKS.forEach(function (r) { if (lv >= r.lv) out.push({ id: 'lv:' + r.lv, kind: 'rank', ja: r.ja, en: r.en }); });
    all().forEach(function (d) { if (d.grantsTitle && finite(u[d.id], 0) > 0) out.push({ id: d.id, kind: 'ach', ja: d.grantsTitle.ja, en: d.grantsTitle.en }); });
    return out;
  }
  function titleText(id, l) {
    if (typeof id !== 'string') return '';
    var m = /^lv:(\d+)$/.exec(id), p = P();
    if (m && p && p.xp) { var r = p.xp.RANKS.filter(function (x) { return x.lv === Number(m[1]); })[0]; return r ? pick(r, l) : ''; }
    var d = def(id); return d && d.grantsTitle ? pick(d.grantsTitle, l) : '';
  }
  // 選んでいる称号（持っていない・選んでいないときは今のランクの名前）
  function title() {
    var p = P(); if (!p) return null;
    var prof = p.store.get(KEYS.profile, {}), t = isObj(prof) ? prof.title : null, own = titles();
    for (var i = 0; i < own.length; i++) if (own[i].id === t) return own[i];
    var r = p.xp.rankFor(p.xp.info().lv);
    return { id: r.id, kind: 'rank', ja: r.ja, en: r.en };
  }
  function setTitle(id) {
    var p = P(); if (!p) return false;
    if (!titles().some(function (t) { return t.id === id; })) return false;
    var prof = p.store.get(KEYS.profile, {}); if (!isObj(prof)) prof = {};
    prof.v = prof.v || 1; prof.title = id; if (!prof.created) prof.created = Date.now();
    p.store.set(KEYS.profile, prof);
    profile.schedule();
    return true;
  }

  // ------------------------------------------------------------------ トースト（KoboUI）
  var autoToast = root.KOBO_ACH_TOASTS !== false, pendingLevel = 0, toastTimer = null, toastQ = [];
  function uiToast(msg, type) {
    var U = root.KoboUI;
    if (!U || typeof U.toast !== 'function' || !root.document || !root.document.body) return false;
    try { U.toast(msg, { type: type || 'accent', ms: 3600 }); return true; } catch (e) { return false; }
  }
  function toast(x) {
    var d = typeof x === 'string' ? def(x) : (x && x.def) || x;
    if (!d || !d.id) return false;
    return uiToast(T('実績「{name}」を獲得！ +{xp} XP', { name: pick(d.title), xp: d.xp }), 'accent');
  }
  function toastLevel(lv) {
    var p = P(); if (!p || !p.xp) return false;
    var r = p.xp.rankFor(lv);
    return uiToast(T('レベルアップ！ Lv{lv}（{rank}）', { lv: lv, rank: pick(r) }), 'ok');
  }
  function flushToasts() {
    toastTimer = null;
    var q = toastQ.splice(0), lv = pendingLevel; pendingLevel = 0;
    if (!autoToast) return;
    var live = q.filter(function (x) { return !x.first; }), first = q.filter(function (x) { return x.first; });
    if (first.length) {
      var xp = first.reduce(function (a, x) { return a + x.def.xp; }, 0);
      uiToast(T('これまでの記録から、実績を {n} 個獲得しました（+{xp} XP）', { n: first.length, xp: xp }), 'accent');
    }
    live.slice(0, 2).forEach(function (x) { toast(x); });
    if (live.length > 2) uiToast(T('ほかに {n} 個の実績を獲得', { n: live.length - 2 }), 'accent');
    if (lv && !first.length) toastLevel(lv);
  }
  function scheduleToasts() {
    if (toastTimer || typeof setTimeout !== 'function' || !root.document) return;
    toastTimer = setTimeout(flushToasts, 700);
  }
  function queueToasts(got, opt) {
    got.forEach(function (x) { toastQ.push({ def: x.def, first: !!opt.first }); });
    scheduleToasts();
  }

  // ------------------------------------------------------------------ 公開プロフィール kbProfiles/{uid}
  var PROF = { perDay: 4, gap: 30 * 60000, debounce: 15000, deniedBackoff: 6 * 3600000, weekEdge: 3 * 60000 };
  var env = {
    now: function () { return Date.now(); },
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
  function nick() {
    var s = store(), n = s ? s.raw(KEYS.nick) : null;
    if (n && n[0] === '"') { try { n = JSON.parse(n); } catch (e) {} }
    return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  }
  function sentRec() { var s = store(), o = s ? s.get(KEYS.sent, {}) : {}; return isObj(o) ? o : {}; }
  function payload() {
    var p = P(); if (!p || !p.xp) return null;
    var n = nick(); if (!n) return null;
    var t = env.now(), info = p.xp.info(t);
    var d = { n: n, lv: Math.max(1, Math.min(999, Math.floor(info.lv))), xpw: Math.max(0, Math.min(12000, Math.floor(info.week))), wk: p.jstWeekKey(t) };
    var prof = p.store.get(KEYS.profile, {});
    if (isObj(prof) && typeof prof.icon === 'string' && prof.icon && prof.icon.length <= 16) d.icon = prof.icon;
    var ti = title(); if (ti && ti.id && ti.id.length <= 24) d.title = ti.id;
    return d;
  }
  function sigOf(d) { return JSON.stringify([d.n, d.lv, d.xpw, d.wk, d.icon || '', d.title || '']); }
  function status() {
    var r = sentRec(), p = P(), t = env.now(), today = p ? p.jstDateKey(t) : 0;
    var n = r.day === today ? finite(r.n, 0) : 0, d = payload();
    var waitMs = 0;
    if (r.off && t < r.off) waitMs = r.off - t;
    else if (n >= PROF.perDay) waitMs = p.jstDayStart(p.addDays(today, 1)) - t;
    else if (r.at && t - r.at < PROF.gap) waitMs = PROF.gap - (t - r.at);
    // 週の境目の前後（ルールの wk はサーバーの時刻で決まる）は送らない
    var wkStart = p ? (p.jstWeekKey(t) * 7 - 3) * 86400000 - 9 * 3600000 : 0;
    var edge = p && (t - wkStart < PROF.weekEdge || wkStart + 7 * 86400000 - t < PROF.weekEdge);
    return { today: n, left: Math.max(0, PROF.perDay - n), last: r.at || 0, backoff: !!(r.off && t < r.off), dirty: !!d && sigOf(d) !== r.sig, payload: d, waitMs: Math.max(0, waitMs), edge: !!edge };
  }
  var pubTimer = null, pubBusy = null;
  // → Promise<{ ok, reason? }>
  function publish(opt) {
    opt = opt || {};
    if (pubBusy) return pubBusy;
    var p = P(), C = env.cloud();
    if (!p || !p.xp) return Promise.resolve({ ok: false, reason: 'platform' });
    if (!C) return Promise.resolve({ ok: false, reason: 'cloud' });
    var st = status();
    if (!st.payload) return Promise.resolve({ ok: false, reason: 'nick' });
    if (!st.dirty && !opt.force) return Promise.resolve({ ok: false, reason: 'same' });
    if (st.edge) return Promise.resolve({ ok: false, reason: 'week-edge', retryMs: PROF.weekEdge * 2 });
    if (st.waitMs > 0) return Promise.resolve({ ok: false, reason: st.backoff ? 'backoff' : st.left ? 'gap' : 'budget', retryMs: st.waitMs });
    var d = st.payload;
    var u = C.user ? C.user() : (C.me && C.me() ? { uid: C.me() } : null);
    var who = u && u.uid ? Promise.resolve(u)
      : (d.xpw > 0 && C.ensureGuest ? Promise.resolve(C.ensureGuest()).then(function (x) { return x && x.uid ? x : null; }, function () { return null; }) : Promise.resolve(null));
    pubBusy = who.then(function (user) {
      if (!user) return { ok: false, reason: 'signin' };
      return env.db().then(function (db) {
        if (!db) return { ok: false, reason: 'db' };
        var data = Object.assign({}, d, { t: env.serverTime() });
        // 数えるのは送る前（失敗しても1回に数える。失敗が続いても1日4回を超えない）
        var r = sentRec(), today = p.jstDateKey(env.now());
        r = { day: today, n: (r.day === today ? finite(r.n, 0) : 0) + 1, at: env.now(), sig: r.sig, off: r.off };
        p.store.set(KEYS.sent, r);
        // merge:true で、ほかの作業（フレンドコード code）が書いた項目を消さない
        return Promise.resolve(db.collection('kbProfiles').doc(user.uid).set(data, { merge: true })).then(function () {
          var r2 = sentRec(); r2.sig = sigOf(d); r2.uid = user.uid; delete r2.off; p.store.set(KEYS.sent, r2);
          return { ok: true, data: d };
        }, function (e) {
          var denied = !!e && (e.code === 'permission-denied' || /permission/i.test(String(e.code || e.message || '')));
          if (denied) { var r3 = sentRec(); r3.off = env.now() + PROF.deniedBackoff; p.store.set(KEYS.sent, r3); }
          return { ok: false, reason: denied ? 'denied' : 'error', error: e };
        });
      });
    }).then(function (x) { pubBusy = null; return x; }, function (e) { pubBusy = null; return { ok: false, reason: 'error', error: e }; });
    return pubBusy;
  }
  function schedule(ms) {
    if (typeof setTimeout !== 'function' || !root.document) return;
    if (pubTimer) clearTimeout(pubTimer);
    pubTimer = setTimeout(function () {
      pubTimer = null;
      publish().then(function (r) {
        // 30分の間隔待ちなら、ページを開いている間にもう一度だけ試す（1日の上限のときは翌日に）
        if (r && (r.reason === 'gap' || r.reason === 'week-edge') && r.retryMs && r.retryMs < 2 * 3600000) schedule(r.retryMs + 1000);
      });
    }, ms == null ? PROF.debounce : ms);
  }
  var profile = { publish: publish, schedule: schedule, status: status, payload: payload, CFG: PROF };

  // ------------------------------------------------------------------ つなぐ
  var KoboAchievements = {
    version: VERSION, GLOBAL: GLOBAL, TIER_XP: TIER_XP,
    all: all, def: def, forGame: forGame, global: global, unlocked: unlocked, has: has, progress: progress, summary: summary,
    evaluate: evaluate, retro: retro, name: name, desc: desc,
    titles: titles, title: title, setTitle: setTitle, titleText: titleText,
    toast: toast, toastLevel: toastLevel, toasts: function (on) { autoToast = on !== false; return autoToast; },
    on: function (f) { if (typeof f !== 'function') return function () {}; listeners.push(f); return function () { var i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; },
    profile: profile,
    _env: function (o) { Object.assign(env, o || {}); return env; },
    _flushToasts: flushToasts,
  };
  root.KoboAchievements = KoboAchievements;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboAchievements;

  var p = P();
  if (!p || !p.xp) return;
  p.xp.achXp = function (id) { var d = def(id); return d ? d.xp : 0; };
  p.on('played', function (x) { evaluate({ live: true, type: 'play_end', event: x && x.event ? x.event : x }); });
  p.on('stage_clear', function (x) { evaluate({ live: true, type: 'stage_clear', event: x }); });
  p.on('progress', function (x) { evaluate({ live: true, type: 'progress', event: x }); });
  p.on('best', function () { evaluate({ live: true }); });
  p.on('xp', function (x) {
    if (x && x.levelUp) { pendingLevel = Math.max(pendingLevel, x.lv); scheduleToasts(); }
    if (x && x.gained > 0) schedule();
  });

  // ページを開いたとき：さかのぼりの判定（初めての端末では1回だけ、まとめてトースト）。
  // cloud.js が別の端末の記録を取り込むのを待って、少しあとにもう一度判定する。プロフィールは変わっていれば送る
  var doc = root.document;
  if (doc && typeof setTimeout === 'function') {
    // さかのぼりは読み込んだらすぐ（localStorage だけを使う）。cloud.js の最初の送信に間に合わせて、書き込みを増やさない
    try { retro(); } catch (e) { if (root.console) console.warn('KoboAchievements retro', e); }
    setTimeout(function () { evaluate({ live: false }); schedule(5000); }, 6000);
    if (doc.addEventListener) doc.addEventListener('visibilitychange', function () { if (doc.visibilityState === 'visible') evaluate({ live: false }); });
    try {
      if (root.location && /[?&]debug\b/.test(root.location.search || '')) root.__kbAch = KoboAchievements;
    } catch (e) {}
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
