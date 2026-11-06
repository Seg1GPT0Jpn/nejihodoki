// ひまつぶし工房：ゲームの登録簿（データだけ。関数は置かない）
// ---------------------------------------------------------------------------------
// 読み込み：ページでは <script src="../common/games.js"></script>（<head>、i18n.js の後）。
//           Service Worker では importScripts('common/games.js')。node のテストでは require()。
// 公開するもの（グローバル）：
//   KOBO_GAMES          ゲームの配列（ハブに並べる順番）
//   KOBO_GENRES         ジャンルの配列 [{ id, ja, en }]
//   KOBO_SHARED_SYNC    どのゲームにも属さない共有のキーの同期のしかた（kusoge.vs.stats など）
//   KOBO_REGISTRY       { version, games, genres, sharedSync, byId(id), ids() }
//
// 1件の形（SYSTEM_ARCHITECTURE.md 2章）：
//   id, order, path, added           ID・ハブの並び順・ページ・追加した日
//   title / short / desc / label     ハブのカードの名前・ランキングの短い名前・説明・カードのタグ（{ ja, en }）
//   genres, tags, keywords           ジャンルの ID（KOBO_GENRES）、絞り込み用のタグ、検索用の言葉
//   icon / iconSvg / iconBg          アイコンのファイル（P1-7 で作る）・今のハブのアイコン（SVG そのまま）・その背景色
//   thumb / thumb2x                  カードのサムネイル（tools/tests/shots.js で作る。P1-7 まではファイルがない）
//   tech                             '2d' | '3d'（3D は低画質モードの対象）
//   flags                            ranking / achievements / daily / versus / pause / stages（今そのページにあるものだけ true。
//                                    achievements は platform.js と achievements.js がイベントと保存から判定するので、全ゲーム true）
//   versus                           'common'（common/versus.js）| 'own'（独自の RTDB 対戦）| null
//   score                            { unit, fmt, order, cap, maxRate } ランキングの表示と上限
//   rankSource                       ランキングに送る値の出どころ（KoboPlatform.rankValue が計算する）
//   record                           ハブのカードに出す自分の記録（KoboPlatform.recordValue / recordText）
//   keys                             そのゲームが使う localStorage のキーの全部と、その中身の説明
//   sync                             同期するキーと、マージのしかた（下の「同期のしかた」）
//   achievements                     ゲームごとの実績の定義（下の ACHIEVEMENTS。P3-3。判定は common/achievements.js）
//
// 値の出どころ（rankSource と record）：
//   { key, paths, agg, offset, min }
//     key     localStorage のキー。値は JSON（数値だけの文字列も可）
//     paths   null なら値そのもの。['best', 'best.maxPts'] のように、オブジェクトの中の場所を並べる
//     agg     'first' = 最初に数値が見つかった場所（cloud.js の pick() と同じ） / 'or' = 最初に真になる場所 / 'max' = 最大
//     offset  足す数（neji・water・parking は「到達したレベル − 1 = クリアした数」）
//     min     record だけ：この値より小さいときはカードに何も出さない
//
// 同期のしかた（sync の値）：
//   'max' | 'newest'                   今の cloud.js がそのまま使える種類
//   それ以外（文字列か、オブジェクト）  フィールドごとのマージの宣言。KoboPlatform.merge.make() で関数になる
//     'max' 'min' 'minPos'（0 より大きい中で小さい方。順位など） 'newest' 'or' 'union'（配列の和集合）
//     'arrMax'（配列の位置ごとに大きい方） 'mapMax'（= { each: 'max' }）
//     { each: 規則 }                              オブジェクトのキーごとに同じ規則
//     { fields: { 名前: 規則 }, rest: 規則, version: 'v', groups: [{ keys: [...], cmp: [...] }] }
//        fields にない名前は rest（省略時 'newest'）。version の値が違うときは大きい方をまるごと使う。
//        groups は、組になった値（例：最高順位とそのときの点数）を、良い方の端末からまとめて取る。
//   'newest' のフィールドは、どちらが新しいかを cloud.js から渡してもらう（ctx.localT / ctx.remoteT）。
//
// 新しいゲームを足すとき：ここに1件足す。firestore.rules の games()・caps()・plus1() も直す（DEVELOPMENT_ROADMAP.md）。
// マージ関数とランキングの値を変えたいときは、P1-2 の担当に頼む（担当を1人にしておくため）。
(function (root) {
  'use strict';

  var VERSION = 1;

  var GENRES = [
    { id: 'puzzle', ja: 'パズル', en: 'Puzzle' },
    { id: 'falling', ja: '落ちもの', en: 'Falling blocks' },
    { id: 'survival', ja: 'サバイバル', en: 'Survival' },
    { id: 'action', ja: 'アクション', en: 'Action' },
    { id: 'cooking', ja: '料理・お店', en: 'Cooking & shop' },
    { id: 'simulation', ja: 'シミュレーション', en: 'Simulation' },
    { id: 'board', ja: 'ボード・テーブル', en: 'Board & table' },
  ];

  var GAMES = [
    {
      id: 'neji', order: 1, path: 'neji/', added: '2026-11-03',
      title: { ja: 'ネジほどき 3D', en: 'Unscrew 3D' },
      short: { ja: 'ネジほどき', en: 'Unscrew 3D' },
      desc: { ja: '模型を回して隠れたネジを探し、同じ色の箱へ。抜く順番を考えないと詰む。', en: 'Turn the model, find hidden screws and drop them in boxes of the same color. Pull them in the wrong order and you get stuck.' },
      label: { ja: '立体パズル', en: '3D puzzle' },
      genres: ['puzzle'], tags: ['3d', 'stages', 'daily', 'versus'],
      keywords: { ja: ['ネジ', 'ねじ', 'パズル', '立体', '3D'], en: ['screw', 'unscrew', 'puzzle', '3d', 'nuts', 'bolts'] },
      icon: 'img/icons/neji.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2b3d4b"/><circle cx="37" cy="39" r="21" fill="#00000055"/><circle cx="36" cy="36" r="21" fill="#f2b33d"/><circle cx="36" cy="36" r="21" fill="none" stroke="#7a520f" stroke-width="2"/><g transform="rotate(-20 36 36)" fill="#4a3108"><rect x="22" y="33" width="28" height="6" rx="3"/><rect x="33" y="22" width="6" height="28" rx="3"/></g></svg>', iconBg: '#2b3d4b',
      thumb: 'img/thumbs/neji.webp', thumb2x: 'img/thumbs/neji@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: true },
      versus: 'common',
      score: { unit: { ja: 'レベル', en: 'levels' }, fmt: { ja: 'LEVEL {n} クリア', en: 'LEVEL {n} cleared' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'nejihodoki3d.maxLevel', paths: null, offset: -1 },
      record: { key: 'nejihodoki3d.maxLevel', paths: null, min: 2, tpl: { ja: 'LEVEL {n} まで到達', en: 'Reached LEVEL {n}' } },
      keys: {
        'nejihodoki3d.level': '今のレベル（数値の JSON）',
        'nejihodoki3d.maxLevel': '到達した最高レベル（数値の JSON）',
        'nejihodoki3d.stars': 'レベルごとの星 { "<level>": 1〜3 }',
        'nejihodoki3d.daily': 'デイリーの星 { "YYYYMMDD": 1〜3 }',
        'nejihodoki3d.sound': '音（true/false）。audio.js が kobo.audio に移行済み（旧キーは残す）',
        'nejihodoki3d.state': '途中の盤 { v:1, level, daily, sig, snap, nbuf, hints, undos, slotUsed, hintUsed, undoUsed, t }（端末だけ。同期しない）',
        'nejihodoki3d.tutorial': 'チュートリアルを終えたか（true）',
        'nejihodoki3d.seenHelp': '遊び方を見たか（true/false）',
      },
      // neji は cloud.js で同期（nejiUsers のトップレベルの古い項目もページ側で読み書きする）
      sync: { 'nejihodoki3d.maxLevel': 'max', 'nejihodoki3d.stars': 'mapMax', 'nejihodoki3d.daily': 'mapMax' },
    },
    {
      id: 'blocks', order: 2, path: 'blocks/', added: '2026-11-03',
      title: { ja: 'ブロックはめ', en: 'Block Fit' },
      short: { ja: 'ブロックはめ', en: 'Block Fit' },
      desc: { ja: '8×8の盤に3つのブロックをはめて、そろった列を消す。置き場がなくなったら終わり。', en: 'Fit three blocks at a time on an 8×8 board and clear full lines. The game ends when nothing fits.' },
      label: { ja: 'パズル', en: 'Puzzle' },
      genres: ['puzzle'], tags: ['2d', 'endless', 'casual', 'versus'],
      keywords: { ja: ['ブロック', 'パズル', '8×8', 'ならべ'], en: ['block', 'blocks', 'puzzle', 'fit', 'grid'] },
      icon: 'img/icons/blocks.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#3b2a1e"/><g stroke="#00000033" stroke-width="1.5"><rect x="10" y="10" width="16" height="16" rx="3" fill="#e5484d"/><rect x="28" y="10" width="16" height="16" rx="3" fill="#e5484d"/><rect x="28" y="28" width="16" height="16" rx="3" fill="#f5c518"/><rect x="46" y="28" width="16" height="16" rx="3" fill="#f5c518"/><rect x="10" y="46" width="16" height="16" rx="3" fill="#3e8ef7"/><rect x="28" y="46" width="16" height="16" rx="3" fill="#3e8ef7"/><rect x="46" y="46" width="16" height="16" rx="3" fill="#3e8ef7"/></g></svg>', iconBg: '#3b2a1e',
      thumb: 'img/thumbs/blocks.webp', thumb2x: 'img/thumbs/blocks@2x.webp',
      tech: '2d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: false },
      versus: 'common',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 100000000, maxRate: null },
      rankSource: { key: 'kusoge.blocks.best', paths: null, offset: 0 },
      record: { key: 'kusoge.blocks.best', paths: null, min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.blocks.best': '最高点（数値の文字列）',
        'kusoge.blocks.state': '途中の盤 { v:1, board, tray, score, combo, moves, b0? }（b0 は開始時のベスト。無い古い形も読める）。終わると消す',
        'kusoge.blocks.daily': '今日のデイリーの盤 { v:1, dateKey, draws, board, tray, score, combo, moves, b0 }。終わると消す（端末内だけ）',
        'kusoge.blocks.howto': '遊び方を見た（\'1\'）',
        'kusoge.blocks.tutorial': 'チュートリアル \'1\' | \'skip\' | \'old\'',
      },
      sync: { 'kusoge.blocks.best': 'max', 'kusoge.blocks.state': 'newest' },
    },
    {
      id: 'drop', order: 3, path: 'drop/', added: '2026-11-03',
      title: { ja: 'おちものタワー', en: 'Drop Tower' },
      short: { ja: 'おちものタワー', en: 'Drop Tower' },
      desc: { ja: '落ちてくるブロックで横一列をそろえて消す。1色でそろえると大量得点。', en: 'Fill rows with falling blocks to clear them. Single-color rows score big.' },
      label: { ja: '落ちもの', en: 'Falling blocks' },
      genres: ['falling'], tags: ['2d', 'endless', 'realtime', 'versus', 'daily'],
      keywords: { ja: ['落ちもの', 'おちもの', 'ブロック', 'テトロ'], en: ['falling', 'blocks', 'drop', 'tower', 'lines'] },
      icon: 'img/icons/drop.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2a2140"/><g stroke="#ffffff55" stroke-width="1.5"><rect x="12" y="50" width="12" height="12" rx="4" fill="#ff7eb6"/><rect x="24" y="50" width="12" height="12" rx="4" fill="#ff7eb6"/><rect x="36" y="50" width="12" height="12" rx="4" fill="#7ee0ff"/><rect x="48" y="50" width="12" height="12" rx="4" fill="#7ee0ff"/><rect x="24" y="38" width="12" height="12" rx="4" fill="#ffd36e"/><rect x="48" y="38" width="12" height="12" rx="4" fill="#7ee0ff"/><rect x="30" y="10" width="12" height="12" rx="4" fill="#a98bff"/><rect x="30" y="22" width="12" height="12" rx="4" fill="#a98bff"/><rect x="42" y="22" width="12" height="12" rx="4" fill="#a98bff"/></g></svg>', iconBg: '#2a2140',
      thumb: 'img/thumbs/drop.webp', thumb2x: 'img/thumbs/drop@2x.webp',
      tech: '2d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: true, stages: false },
      versus: 'common',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 100000000, maxRate: null },
      rankSource: { key: 'kusoge.drop.best', paths: null, offset: 0 },
      record: { key: 'kusoge.drop.best', paths: null, min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.drop.best': '最高点（数値の文字列）',
        'kusoge.drop.state': '途中の盤 { v:1, normal: snap|null, daily: snap|null }（snap = mode, board, cur, hold, canHold, queue, bag, cbag, score, lines, level, soroi, playMs。daily のときは dateKey/seed/rn/left）。終わると消す',
        'kusoge.drop.seen': '遊び方を見たか（"1"）。端末だけ',
        'kusoge.drop.tut': 'チュートリアルを終えたか（"1"）。端末だけ',
      },
      sync: { 'kusoge.drop.best': 'max', 'kusoge.drop.state': 'newest' },
    },
    {
      id: 'raft', order: 4, path: 'raft/', added: '2026-11-03',
      title: { ja: 'いかだ暮らし', en: 'Raft Life' },
      short: { ja: 'いかだ暮らし', en: 'Raft Life' },
      desc: { ja: '水没した世界で漂流物を拾い、イカダを広げて生き延びる。サメに注意。', en: 'In a flooded world, grab floating debris, grow your raft and survive. Watch out for the shark.' },
      label: { ja: 'サバイバル', en: 'Survival' },
      genres: ['survival'], tags: ['3d', 'realtime', 'crafting', 'versus'],
      keywords: { ja: ['いかだ', 'イカダ', 'サバイバル', '海', 'サメ'], en: ['raft', 'survival', 'ocean', 'shark', 'craft'] },
      icon: 'img/icons/raft.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#127a86"/><path d="M0 52 q9 -6 18 0 t18 0 t18 0 t18 0 V72 H0z" fill="#0d5f69"/><g fill="#c98b4f" stroke="#7a4f2a" stroke-width="1.5"><rect x="16" y="34" width="40" height="7" rx="2"/><rect x="16" y="42" width="40" height="7" rx="2"/></g><rect x="34" y="12" width="3" height="23" fill="#7a4f2a"/><path d="M37 13 L54 30 H37z" fill="#f4f2ec"/><circle cx="60" cy="14" r="5" fill="#f5c518"/></svg>', iconBg: '#127a86',
      thumb: 'img/thumbs/raft.webp', thumb2x: 'img/thumbs/raft@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: true, stages: false },
      versus: 'common',
      score: { unit: { ja: '日生存', en: 'days' }, fmt: null, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.raft.best', paths: null, offset: 0 },
      record: { key: 'kusoge.raft.best', paths: null, min: 1, tpl: { ja: '最長 {n} 日生存', en: 'Longest: {n} days survived' } },
      keys: {
        'kusoge.raft.gfx': 'この端末の画質（0〜2。同期しない）',
        'kusoge.raft.best': '最長の生存日数（数値の文字列）',
        'kusoge.raft.save': '今の回の状態まるごと（v, day, tiles, crew, res …）。死ぬと消す',
        'kusoge.raft.seen3': '遊び方を見たか',
      },
      // save は1回の航海の状態なので、フィールドごとに混ぜると壊れる。まるごと newest（削除は P1-5 のトゥームストーン）
      sync: { 'kusoge.raft.best': 'max', 'kusoge.raft.save': 'newest' },
    },
    {
      id: 'gates', order: 5, path: 'gates/', added: '2026-11-03',
      title: { ja: 'ゲートランナー', en: 'Gate Runner' },
      short: { ja: 'ゲートランナー', en: 'Gate Runner' },
      desc: { ja: '数字のゲートをくぐって仲間を増やし、敵の群れとボスを撃ち倒す。', en: 'Run through number gates to grow your crowd, then shoot down enemy hordes and the boss.' },
      label: { ja: 'アクション', en: 'Action' },
      genres: ['action'], tags: ['3d', 'stages', 'realtime', 'upgrades', 'versus'],
      keywords: { ja: ['ゲート', 'ランナー', 'アクション', 'ゾンビ', '育成'], en: ['gate', 'runner', 'action', 'crowd', 'zombie'] },
      icon: 'img/icons/gates.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#3a4a2a"/><path d="M26 0 H46 L66 72 H6z" fill="#5c6670"/><rect x="10" y="20" width="24" height="16" rx="3" fill="#30a46c"/><text x="22" y="32" font-size="11" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">×2</text><rect x="38" y="20" width="24" height="16" rx="3" fill="#e5484d"/><text x="50" y="32" font-size="11" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">−5</text><g fill="#3e8ef7"><circle cx="30" cy="56" r="4"/><circle cx="38" cy="56" r="4"/><circle cx="34" cy="49" r="4"/><circle cx="42" cy="49" r="4"/><circle cx="26" cy="49" r="4"/></g></svg>', iconBg: '#3a4a2a',
      thumb: 'img/thumbs/gates.webp', thumb2x: 'img/thumbs/gates@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: true, stages: true },
      versus: 'common',
      score: { unit: { ja: 'ステージ', en: 'stage' }, fmt: { ja: 'STAGE {n}', en: 'STAGE {n}' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.gates.save', paths: ['best', 'bestStage'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.gates.save', paths: ['best', 'bestStage', 'stage'], agg: 'or', min: 1, tpl: { ja: 'ステージ {n} まで到達', en: 'Reached stage {n}' } },
      keys: {
        'kusoge.gates.save': '{ v:2, best, stage, coins, mat, exp, bld:{…}, heroes:{ id:{ lv, star, cards } }, sel:[…], runs, tut, seen }（tut・seen はチュートリアル・遊び方を見たかの 0/1。旧2D版は gates の migrate() が読む）',
      },
      // R4：コイン・素材・経験値・カード（使うと減るもの）と選択は newest、最高ステージ・建物・ヒーローのレベルと星は max
      sync: {
        'kusoge.gates.save': {
          version: 'v',
          fields: {
            v: 'max', best: 'max', stage: 'newest', coins: 'newest', mat: 'newest', exp: 'newest', runs: 'max',
            bld: { each: 'max' },
            heroes: { each: { fields: { lv: 'max', star: 'max', cards: 'newest' } } },
            sel: 'newest', migrated: 'max', tut: 'max', seen: 'max',
          },
        },
      },
    },
    {
      id: 'n59049', order: 6, path: 'n59049/', added: '2026-11-03',
      title: { ja: '59049', en: '59049' },
      short: { ja: '59049', en: '59049' },
      desc: { ja: '3×3×3の立体で、同じ数字を3つ並べると合体して3倍。目指せ 59049。', en: 'On a 3×3×3 cube, line up three equal numbers to merge them into triple. Aim for 59049.' },
      label: { ja: '立体数字', en: '3D numbers' },
      genres: ['puzzle'], tags: ['3d', 'endless', 'numbers', 'versus', 'daily'],
      keywords: { ja: ['数字', '合体', '立体', '59049', 'パズル'], en: ['numbers', 'merge', 'cube', '3d', 'puzzle'] },
      icon: 'img/icons/n59049.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2d2a45"/><g stroke="#ffffff44" stroke-width="1.5"><path d="M36 12 L58 24 L36 36 L14 24z" fill="#8e7cf0"/><path d="M14 24 L36 36 V60 L14 48z" fill="#5b4bc4"/><path d="M58 24 L36 36 V60 L58 48z" fill="#463aa0"/></g><text x="36" y="28" font-size="10" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">243</text><text x="25" y="47" font-size="9" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">27</text><text x="47" y="47" font-size="9" font-weight="900" text-anchor="middle" fill="#fff" font-family="sans-serif">9</text></svg>', iconBg: '#2d2a45',
      thumb: 'img/thumbs/n59049.webp', thumb2x: 'img/thumbs/n59049@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: false },
      versus: 'common',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 1000000000, maxRate: null },
      rankSource: { key: 'kusoge.n59049.best', paths: null, offset: 0 },
      record: { key: 'kusoge.n59049.best', paths: null, min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.n59049.best': '最高点（数値の文字列）',
        'kusoge.n59049.bestTile': '作った最大の数字（数値の文字列）',
        'kusoge.n59049.state': '途中の盤 { v:1, cells, score, undoLeft, prev, won, yaw, pitch, t, b0?, mv? }',
        'kusoge.n59049.daily': '今日のデイリーの盤 { v:1, dateKey, draws, cells, score, won, mv, yaw, pitch, t }。終わると消す（端末だけ）',
        'kusoge.n59049.howto': '遊び方を見た（\'1\'）',
        'kusoge.n59049.tutorial': '\'1\' | \'skip\' | \'old\'',
      },
      // bestTile は今は同期されていない（AUDIT 2章）。ここで max に足す
      sync: { 'kusoge.n59049.best': 'max', 'kusoge.n59049.bestTile': 'max', 'kusoge.n59049.state': 'newest' },
    },
    {
      id: 'water', order: 7, path: 'water/', added: '2026-11-03',
      title: { ja: 'いろみず分け', en: 'Color Water Sort' },
      short: { ja: 'いろみず分け', en: 'Color Water Sort' },
      desc: { ja: '試験管の色水を注ぎ分けて、同じ色にそろえる。毎回解けることを確かめたステージ。', en: 'Pour colored water between tubes until each holds one color. Every stage is checked to be solvable.' },
      label: { ja: 'パズル', en: 'Puzzle' },
      genres: ['puzzle'], tags: ['2d', 'stages', 'relax', 'versus', 'daily'],
      keywords: { ja: ['色水', 'いろみず', '試験管', 'ソート', 'パズル'], en: ['water', 'sort', 'color', 'tubes', 'puzzle'] },
      icon: 'img/icons/water.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#1f3340"/><g stroke="#cfe8f5" stroke-width="2" fill="none"><path d="M14 12 V54 a6 6 0 0 0 12 0 V12"/><path d="M30 12 V54 a6 6 0 0 0 12 0 V12"/><path d="M46 12 V54 a6 6 0 0 0 12 0 V12"/></g><rect x="15" y="40" width="10" height="20" rx="4" fill="#e93d82"/><rect x="15" y="30" width="10" height="10" fill="#30a46c"/><rect x="31" y="44" width="10" height="16" rx="4" fill="#30a46c"/><rect x="47" y="36" width="10" height="24" rx="4" fill="#3e8ef7"/><rect x="47" y="28" width="10" height="8" fill="#e93d82"/></svg>', iconBg: '#1f3340',
      thumb: 'img/thumbs/water.webp', thumb2x: 'img/thumbs/water@2x.webp',
      tech: '2d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: true },
      versus: 'common',
      score: { unit: { ja: 'ステージ', en: 'stages' }, fmt: { ja: '{n} ステージ', en: '{n} stages' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.water.save', paths: ['best', 'level'], agg: 'first', offset: -1 },
      record: { key: 'kusoge.water.save', paths: ['best', 'level'], agg: 'or', min: 2, tpl: { ja: 'ステージ {n} まで到達', en: 'Reached stage {n}' } },
      keys: {
        'kusoge.water.cur': '途中のステージ { v:1, L, log }（端末だけ）',
        'kusoge.water.daily': '今日のデイリー { v:1, dateKey, idx, logs, log, ms } または { v:1, dateKey, done:true, score, pours, hints, extra, ms }（端末だけ）',
        'kusoge.water.howto': '遊び方を見た（\'1\'）',
        'kusoge.water.tut': '\'1\' | \'skip\' | \'old\'',
        'kusoge.water.save': '{ level, best, stars:{ "<level>": 1〜3 } }',
      },
      sync: { 'kusoge.water.save': { fields: { level: 'newest', best: 'max', stars: 'mapMax' } } },
    },
    {
      id: 'parking', order: 8, path: 'parking/', added: '2026-11-03',
      title: { ja: 'くるま出し', en: 'Car Out' },
      short: { ja: 'くるま出し', en: 'Car Out' },
      desc: { ja: '矢印の向き（前）にしか走れない車を、ぶつけずに順番に駐車場から出す。', en: 'Cars only drive the way their arrow points. Get them out of the parking lot one by one without crashing.' },
      label: { ja: 'パズル', en: 'Puzzle' },
      genres: ['puzzle'], tags: ['3d', 'stages', 'relax', 'versus', 'daily'],
      keywords: { ja: ['車', 'くるま', '駐車場', 'パズル'], en: ['car', 'parking', 'jam', 'puzzle'] },
      icon: 'img/icons/parking.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#3b4148"/><g stroke="#f4f2ec" stroke-width="1.5" stroke-dasharray="3 3"><path d="M24 8 V64"/><path d="M48 8 V64"/></g><rect x="8" y="12" width="12" height="22" rx="3" fill="#e5484d"/><rect x="28" y="30" width="16" height="12" rx="3" fill="#f5c518"/><rect x="52" y="16" width="12" height="30" rx="3" fill="#3e8ef7"/><rect x="8" y="42" width="34" height="12" rx="3" fill="#30a46c"/><path d="M60 54 l4 6 l-8 0z" fill="#f76b15"/></svg>', iconBg: '#3b4148',
      thumb: 'img/thumbs/parking.webp', thumb2x: 'img/thumbs/parking@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: true },
      versus: 'common',
      score: { unit: { ja: 'ステージ', en: 'stages' }, fmt: { ja: '{n} ステージ', en: '{n} stages' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.parking.save', paths: ['best', 'level'], agg: 'first', offset: -1 },
      record: { key: 'kusoge.parking.save', paths: ['best', 'level'], agg: 'or', min: 2, tpl: { ja: 'ステージ {n} まで到達', en: 'Reached stage {n}' } },
      keys: {
        'kusoge.parking.state': '途中の駐車場 { v:1, n, st:[x,y,d…], moves, undosLeft, hintsLeft } | null（端末だけ）',
        'kusoge.parking.daily': '今日のデイリー { v:1, dateKey, idx, score, stars:[], moves, done, lot }（端末だけ）',
        'kusoge.parking.howto': '遊び方を見た（\'1\'）',
        'kusoge.parking.tutorial': '\'1\' | \'skip\' | \'old\'',
        'kusoge.parking.save': '{ level, best, stars:{ "<level>": 1〜3 } }',
      },
      sync: { 'kusoge.parking.save': { fields: { level: 'newest', best: 'max', stars: 'mapMax' } } },
    },
    {
      id: 'hole', order: 9, path: 'hole/', added: '2026-11-03',
      title: { ja: 'あなぼこシティ', en: 'Hole City' },
      short: { ja: 'あなぼこシティ', en: 'Hole City' },
      desc: { ja: '穴を動かして街の物を吸い込み、大きくなる。ライバルの穴に食べられるな。', en: 'Move a hole to swallow the city and grow bigger. Don\'t get eaten by rival holes.' },
      label: { ja: '3Dアクション', en: '3D action' },
      genres: ['action'], tags: ['3d', 'realtime', 'stages', 'shop', 'versus'],
      keywords: { ja: ['穴', 'あな', '街', 'シティ', '吸い込み'], en: ['hole', 'city', 'swallow', 'io', 'action'] },
      icon: 'img/icons/hole.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#6fae5a"/><rect x="0" y="40" width="72" height="12" fill="#5c6670"/><rect x="8" y="10" width="12" height="18" fill="#e8e2d6"/><rect x="50" y="8" width="14" height="22" fill="#c9a46a"/><circle cx="62" cy="48" r="4" fill="#e5484d"/><ellipse cx="34" cy="50" rx="18" ry="9" fill="#111"/><ellipse cx="34" cy="50" rx="18" ry="9" fill="none" stroke="#f2b33d" stroke-width="2"/><rect x="28" y="38" width="8" height="8" fill="#3e8ef7" transform="rotate(25 32 42)"/></svg>', iconBg: '#6fae5a',
      thumb: 'img/thumbs/hole.webp', thumb2x: 'img/thumbs/hole@2x.webp',
      tech: '3d',
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: true, stages: true },
      versus: 'own',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 1000000, maxRate: null },
      // R10：matchPts は「最高順位を取ったときの点数」で、最高点ではない。最高点は best.maxPts（P2-hole が足す）。
      // 古い保存には maxPts がないので、実際に取った点数である matchPts との大きい方を使う（下がることはない）。
      rankSource: { key: 'kusoge.hole.save', paths: ['best.maxPts', 'best.matchPts'], agg: 'max', offset: 0 },
      // R9：今のハブは best.score / best.size を読むが、そのフィールドはない（いつも空）。ランキングと同じ最高点を出す
      record: { key: 'kusoge.hole.save', paths: ['best.maxPts', 'best.matchPts'], agg: 'max', min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.hole.save': '{ best:{ matchRank, matchPts, maxPts?, soloPct, soloStars, maxSize }, coins, skins:{ owned:[…], sel }, perks:{ size, speed }, wins, camp:{ open, stars:[14], best:[14] }, online:{ plays, wins, best }, city, seen, tut }',
        'kusoge.hole.rooms': 'この端末で最近入ったオンライン部屋（最大8件の { r, t }。同期しない）',
      },
      // R4：コイン（使うと減る）・選んだスキン・選んだ街は newest。持っているスキンは和集合、強化・記録・まちめぐりは大きい方。
      // 最高順位とそのときの点数は組なので、良い方（順位が小さい → 点が大きい）の端末からまとめて取る。
      sync: {
        'kusoge.hole.save': {
          fields: {
            best: {
              fields: { soloPct: 'max', soloStars: 'max', maxSize: 'max', maxPts: 'max' }, rest: 'max',
              groups: [{ keys: ['matchRank', 'matchPts'], cmp: ['minPos', 'max'] }],
            },
            coins: 'newest',
            skins: { fields: { owned: 'union', sel: 'newest' } },
            perks: { each: 'max' },
            wins: 'max',
            camp: { fields: { open: 'max', stars: 'arrMax', best: 'arrMax' } },
            online: { fields: { plays: 'max', wins: 'max', best: 'minPos' } },
            city: 'newest',
            seen: 'max',
            tut: 'max',
          },
        },
      },
    },
    {
      id: 'hitsumabushi', order: 10, path: 'hitsumabushi/', added: '2026-11-04',
      title: { ja: 'ひつまぶし工房', en: 'Hitsumabushi Workshop' },
      short: { ja: 'ひつまぶし工房', en: 'Hitsumabushi' },
      desc: { ja: '炭火でうなぎを焼き、タレを塗り、刻んで盛る。注文と食べ方どおりに出して、町いちばんの老舗をめざす。', en: 'Grill eel over charcoal, brush on the tare, chop and plate it. Serve every order the way the customer eats it, and grow a street stall into the oldest shop in town.' },
      label: { ja: '料理のお店', en: 'Cooking shop' },
      genres: ['cooking'], tags: ['2d', 'realtime', 'shop', 'versus', 'daily'],
      keywords: { ja: ['ひつまぶし', 'うなぎ', '鰻', 'うな丼', '料理', 'お店', '経営'], en: ['hitsumabushi', 'eel', 'unagi', 'cooking', 'restaurant', 'shop', 'grill'] },
      icon: 'img/icons/hitsumabushi.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2a1a12"/><rect x="6" y="50" width="60" height="16" rx="3" fill="#2e2926"/><g fill="#ff8a2a"><circle cx="16" cy="58" r="4"/><circle cx="29" cy="59" r="4"/><circle cx="42" cy="58" r="4"/><circle cx="55" cy="59" r="4"/></g><ellipse cx="36" cy="38" rx="27" ry="13" fill="#93602f"/><ellipse cx="36" cy="33" rx="27" ry="12" fill="#c99359"/><ellipse cx="36" cy="33" rx="22" ry="9" fill="#fbf8f0"/><g fill="#a8541c" stroke="#5a2a0c" stroke-width=".8"><rect x="19" y="26" width="10" height="6" rx="2"/><rect x="30" y="26" width="10" height="6" rx="2"/><rect x="41" y="26" width="9" height="6" rx="2"/><rect x="23" y="33" width="10" height="6" rx="2"/><rect x="34" y="33" width="10" height="6" rx="2"/><rect x="45" y="33" width="6" height="6" rx="2"/></g><g fill="#fff" opacity=".55"><rect x="20" y="27" width="7" height="1.2"/><rect x="31" y="27" width="7" height="1.2"/><rect x="42" y="27" width="6" height="1.2"/></g><path d="M22 18 q-4 -6 1 -11 M36 16 q-4 -6 1 -11 M50 18 q-4 -6 1 -11" stroke="#fff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/></svg>', iconBg: '#2a1a12',
      thumb: 'img/thumbs/hitsumabushi.webp', thumb2x: 'img/thumbs/hitsumabushi@2x.webp',
      tech: '2d',
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: true, stages: false },
      versus: 'common',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 100000, maxRate: null },
      // the best score of one business day (normal shop days only; dailies and matches never touch it)
      rankSource: { key: 'kusoge.hitsumabushi.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.hitsumabushi.save', paths: ['best'], agg: 'first', min: 1, num: true, tpl: { ja: '1日のベスト {n} 点', en: 'Best day: {n} pts' } },
      keys: {
        'kusoge.hitsumabushi.save': '{ v:1, day（次に開く日）, best（1日の最高点）, money, stock（うなぎ）, rep（評判）, rank（0〜4 屋台→老舗）, up:{ grills, seats, coal, look }, menu:[…], regs:{ <id>:{ visits, known } }, stats:{ served, perfect, remembered, days, angry, score }, story, tut }。営業中の日は保存しない（閉店で書く）',
        'kusoge.hitsumabushi.howto': '遊び方を見た（\'1\'）',
      },
      // お金・在庫・評判は使うと減るので newest。日・ベスト・格・改装・統計は大きい方、メニューは和集合、常連は回数の大きい方
      sync: {
        'kusoge.hitsumabushi.save': {
          fields: {
            day: 'max', best: 'max', money: 'newest', stock: 'newest', rep: 'newest', rank: 'max',
            up: { each: 'max' }, menu: 'union', regs: { each: { fields: { visits: 'max', known: 'or' } } }, stats: { each: 'max' },
            story: 'max', tut: 'max',
          },
          rest: 'newest',
        },
      },
    },
    {
      id: 'planet', order: 11, path: 'planet/', added: '2026-11-04',
      title: { ja: 'わくせいシミュレーター', en: 'Planet Simulator' },
      short: { ja: 'わくせい', en: 'Planet' },
      desc: { ja: '地球のような星を、誕生から46億年かけて育てる。温室効果・氷の反射・岩の風化・プレート・海流・生命と酸素、そして文明。', en: 'Grow an Earth-like planet over 4.6 billion years: the greenhouse effect, reflecting ice, rock weathering, plates, ocean currents, life and oxygen, and finally a civilization.' },
      label: { ja: 'シミュレーション', en: 'Simulation' },
      genres: ['simulation'], tags: ['3d', 'sandbox', 'science', 'stages'],
      keywords: { ja: ['惑星', 'わくせい', '地球', '気候', '温暖化', '進化', '生命', '文明', 'シミュレーション', '科学'], en: ['planet', 'earth', 'climate', 'warming', 'evolution', 'life', 'civilization', 'simulation', 'science'] },
      icon: 'img/icons/planet.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#0b1430"/><g fill="#dfe8ff"><circle cx="9" cy="12" r="1"/><circle cx="20" cy="6" r=".8"/><circle cx="64" cy="58" r="1"/><circle cx="8" cy="62" r=".8"/></g><circle cx="58" cy="14" r="12" fill="#ffd36b" opacity=".18"/><circle cx="58" cy="14" r="7" fill="#ffd36b"/><circle cx="34" cy="39" r="23" fill="#2a78c2"/><path d="M16 31c5-6 11-2 15-6 5-4 12 0 14 5-4 5-9 2-13 6-4 5-10 6-16 3z" fill="#4fb35a"/><path d="M30 52c4-3 9-1 12-4 3 2 3 6-1 8-4 1-8 0-11-4z" fill="#4fb35a"/><path d="M25 18c3-1 6-2 10-2" stroke="#f4f8fc" stroke-width="5" stroke-linecap="round"/><path d="M20 21c5-3 12-4 19-3M40 44c4 0 7-1 10-3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/><path d="M13 47a23 23 0 0 0 42-5" stroke="#05122b" stroke-width="9" fill="none" opacity=".35"/><circle cx="34" cy="39" r="23" fill="none" stroke="#9fd6ff" stroke-width="1.5" opacity=".7"/></svg>', iconBg: '#0b1430',
      thumb: 'img/thumbs/planet.webp', thumb2x: 'img/thumbs/planet@2x.webp',
      tech: '3d',
      // no online battle: a planet grows over millions of years, not in a 3-minute match
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      // the sum of the best score of each of the 8 scenarios (up to 1,000 each)
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n} 点', en: '{n} pts' }, order: 'desc', cap: 10000, maxRate: null },
      rankSource: { key: 'kusoge.planet.save', paths: ['total'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.planet.save', paths: ['total'], agg: 'first', min: 1, num: true, tpl: { ja: 'シナリオ合計 {n} 点', en: 'Scenario total: {n} pts' } },
      keys: {
        'kusoge.planet.save': '{ v:1, sc:{ <シナリオid>:{ best（0〜1000）, stars（1〜3） } }（クリアしたものだけ）, total（best の合計＝ランキング）, stats:{ life, goe, thaw, civ, space, ext, collapse, worlds, clears, maxMyr }, tut }',
        'kusoge.planet.world': '自由モードの星 { v:1, t（年）, p:{ dist, size, water, n2, co2, seed }, T[32], A, O, ch4, o2, wl, lost, iceL/iceO/veg（64×32 を1文字ずつ）, plates[], bumps[], craters[], volcs[], life{}, civ{}, ev[], flags{}, hist:{ r[], l[] }, spd, at }。15秒ごと・止めたとき・隠れたときに書く',
        'kusoge.planet.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow: per-field max (stars and bests per scenario). The free-mode planet is one whole state: newest wins
      sync: {
        'kusoge.planet.save': { fields: { sc: { each: { fields: { best: 'max', stars: 'max' } } }, total: 'max', stats: { each: 'max' }, tut: 'max' }, rest: 'newest' },
        'kusoge.planet.world': 'newest',
      },
    },
    {
      id: 'hitblow', order: 12, path: 'hitblow/', added: '2026-11-06',
      title: { ja: 'ヒットアンドブロー', en: 'Hit & Blow' },
      short: { ja: 'ヒット&ブロー', en: 'Hit & Blow' },
      desc: { ja: 'かくれた数字や色の並びを、ヒットとブローのヒントから推理して当てる。今日のチャレンジ、CPUとの当て合い、オンライン対戦も。', en: 'Deduce a hidden row of digits or colors from Hit and Blow clues. Daily challenge, a guessing duel with the CPU, and online battles.' },
      label: { ja: '推理パズル', en: 'Logic puzzle' },
      genres: ['puzzle'], tags: ['2d', 'logic', 'turn', 'daily', 'versus'],
      keywords: { ja: ['ヒットアンドブロー', 'ヒット', 'ブロー', '数当て', '推理', 'パズル', '数字', '色'], en: ['hit and blow', 'bulls and cows', 'code breaking', 'logic', 'deduction', 'puzzle', 'digits', 'colors'] },
      icon: 'img/icons/hitblow.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#14182b"/><g stroke="#262f57" stroke-width="1.2"><path d="M0 14h72M0 28h72M0 42h72M0 56h72"/></g><g fill="#262d52" stroke="#4a5590" stroke-width="1.5"><rect x="7" y="11" width="13" height="15" rx="3.5"/><rect x="22.5" y="11" width="13" height="15" rx="3.5"/><rect x="38" y="11" width="13" height="15" rx="3.5"/><rect x="53.5" y="11" width="13" height="15" rx="3.5"/></g><g fill="#eef0ff" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="12" text-anchor="middle"><text x="13.5" y="23">4</text><text x="29" y="23">1</text><text x="44.5" y="23">2</text><text x="60" y="23">3</text></g><circle cx="22" cy="48" r="13" fill="#46d6b4"/><text x="22" y="53" fill="#06241d" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" text-anchor="middle">1H</text><circle cx="50" cy="48" r="11.5" fill="none" stroke="#ffb547" stroke-width="3"/><text x="50" y="53" fill="#ffb547" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" text-anchor="middle">2B</text></svg>', iconBg: '#14182b',
      thumb: 'img/thumbs/hitblow.webp', thumb2x: 'img/thumbs/hitblow@2x.webp',
      tech: '2d',
      // turn-based: hiding the page saves the unfinished game (the clock only runs while it is on screen)
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: false },
      versus: 'common',
      // one solved puzzle: (tries left + 1) × 100 + time bonus, × difficulty (1–3) × 1.5 with repeats → at most 6,480
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 10000, maxRate: null },
      rankSource: { key: 'kusoge.hitblow.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.hitblow.save', paths: ['best'], agg: 'first', min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.hitblow.save': '{ v:1, best（1問の最高点＝ランキング。ひとりで遊んだときだけ）, bests:{ <n|c><3|4|5>[x]:{ s（点）, g（最少の回数）, t（最速 ms） } }, stats:{ plays, wins, losses, lucky（1回目で正解）, fast4（4つを4回以内）, win5, winDup, cpuPlays, cpu1, cpu2, cpu3（CPU の強さごとの勝ち）, vsSolved }, daily:{ last, win（最後に当てた日）, streak, max, res:{ dk, won, g, s, ms, a, rows } }, set:{ sym, d, dup, cpu }, tut }',
        'kusoge.hitblow.state': '途中のゲーム（ひとり・デイリー）{ v:1, kind, cfg, secret, rows:[[推理, H, B]], cur, ms, dk, memo:{ s[], p[] }, tut }。この端末だけ（同期しない）。終わると消す',
        'kusoge.hitblow.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (max; fewest tries / fastest = minPos); settings and the last daily result are whole values (newest)
      sync: {
        'kusoge.hitblow.save': {
          fields: {
            best: 'max', bests: { each: { fields: { s: 'max', g: 'minPos', t: 'minPos' } } }, stats: { each: 'max' },
            daily: { fields: { last: 'max', win: 'max', max: 'max' }, rest: 'newest' }, set: 'newest', tut: 'max',
          },
          rest: 'newest',
        },
      },
    },
    {
      id: 'shogi', order: 13, path: 'shogi/', added: '2026-11-06',
      title: { ja: '将棋', en: 'Shogi' },
      short: { ja: '将棋', en: 'Shogi' },
      desc: { ja: '9×9の盤で指す本将棋。5段階の CPU、ふたりで、オンライン対局（持ち時間つき）、詰将棋。駒の動きの説明つき。', en: 'Full Japanese chess on a 9×9 board: a 5-level CPU, two players on one device, timed online matches and tsume puzzles, with a guide to how every piece moves.' },
      label: { ja: 'ボードゲーム', en: 'Board game' },
      genres: ['board'], tags: ['2d', 'turn', 'versus', 'online', 'puzzle'],
      keywords: { ja: ['将棋', 'しょうぎ', '詰将棋', '対局', 'ボードゲーム', '盤', '駒'], en: ['shogi', 'japanese chess', 'chess', 'tsume', 'board game'] },
      icon: 'img/icons/shogi.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2a2118"/><rect x="6" y="6" width="60" height="60" rx="3" fill="#dcae62"/><g stroke="#5a3a14" stroke-width="1"><path d="M6 21h60M6 36h60M6 51h60M21 6v60M36 6v60M51 6v60"/></g><path d="M36 13l14 6 4 34H18l4-34z" fill="#f6e2b0" stroke="#7a5524" stroke-width="2"/><text x="36" y="45" font-family="serif" font-weight="700" font-size="24" text-anchor="middle" fill="#1b1209">王</text></svg>', iconBg: '#2a2118',
      thumb: 'img/thumbs/shogi.webp', thumb2x: 'img/thumbs/shogi@2x.webp',
      tech: '2d',
      // turn-based (hiding the page only saves the CPU game); online matches run on RTDB shogi/* (database.rules.json)
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: false, stages: false },
      versus: 'own',
      // wins against the strongest CPU (even games, no take-backs): each one needs a real win, so it is not farmable by short plays
      score: { unit: { ja: '勝', en: 'wins' }, fmt: { ja: '{n} 勝', en: '{n} wins' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.shogi.save', paths: ['top'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.shogi.save', paths: ['top'], agg: 'first', min: 1, num: true, tpl: { ja: '最強CPUに {n}勝', en: '{n} wins vs the strongest CPU' } },
      keys: {
        'kusoge.shogi.save': '{ v:1, cpu:{ l1〜l5:{ w, l, d } }（CPU の強さごとの勝ち負け）, top（最強に平手・待ったなしで勝った数＝ランキング）, on:{ r（レーティング）, w, l, d, best }, mate:{ s:[解いた詰将棋の id] }, stats:{ games, wins, moves }, tut }',
        'kusoge.shogi.game': '続きから遊べる対局（CPU・ふたりで）{ v:1, mode, lv, human, hc（駒落ち）, moves:[USI], undo, at }。終わると消す',
        'kusoge.shogi.howto': '遊び方を見た（\'1\'）',
        'kusoge.shogi.cpuPick': 'CPU 戦の設定 { lv, side, hc }（同期しない）',
        'kusoge.shogi.tc': 'オンラインの持ち時間の選択 0〜2（同期しない）',
        'kusoge.shogi.guide': '動きのガイド（\'1\' / \'0\'。同期しない）',
        'kusoge.shogi.rooms': 'この端末で最近入ったオンライン部屋（最大8件の { r, t }。同期しない）',
      },
      // records only grow (max, per level and field); the rating goes up and down (newest); solved puzzles: union.
      // The unfinished game is one whole state: newest wins
      sync: {
        'kusoge.shogi.save': {
          fields: {
            cpu: { each: { fields: { w: 'max', l: 'max', d: 'max' } } }, top: 'max',
            on: { fields: { r: 'newest', w: 'max', l: 'max', d: 'max', best: 'max' } },
            mate: { fields: { s: 'union' } }, stats: { each: 'max' }, tut: 'max',
          },
          rest: 'newest',
        },
        'kusoge.shogi.game': 'newest',
      },
    },
    {
      id: 'escape', order: 14, path: 'escape/', added: '2026-11-06',
      title: { ja: 'からくり工房からの脱出', en: 'Escape the Gadget Workshop' },
      short: { ja: '脱出', en: 'Escape' },
      desc: { ja: '旅に出た親方が残した、5つのからくり部屋。歯車・時計・光と色・はかり・星の手がかりを集めて、屋根裏まで抜け出す脱出ゲーム。ヒントは3段階。', en: 'The Master left on a journey and locked five rooms with gadgets. Gather clues — gears, clocks, light and color, scales, stars — and escape up to the attic. Hints come in 3 steps.' },
      label: { ja: '脱出ゲーム', en: 'Escape game' },
      genres: ['puzzle'], tags: ['2d', 'escape', 'story', 'stages', 'hints'],
      keywords: { ja: ['脱出', '脱出ゲーム', 'からくり', '謎解き', 'なぞとき', 'パズル', '工房', 'ヒント'], en: ['escape', 'escape room', 'room escape', 'puzzle', 'point and click', 'mystery', 'workshop', 'gadgets'] },
      icon: 'img/icons/escape.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2a1d14"/><g fill="#3a2a1e"><rect x="4" y="0" width="8" height="72"/><rect x="20" y="0" width="8" height="72"/><rect x="44" y="0" width="8" height="72"/><rect x="60" y="0" width="8" height="72"/></g><rect x="0" y="58" width="72" height="14" fill="#5a3a22"/><path d="M20 62V22a16 16 0 0 1 32 0v40z" fill="#ffd98a"/><path d="M20 62V22a16 16 0 0 1 32 0v40z" fill="none" stroke="#1a0f08" stroke-width="2.5"/><path d="M27 62V24c0-4 4-6 9-6s9 2 9 6v38z" fill="#9a5e32" stroke="#1a0f08" stroke-width="2" transform="skewY(-8) translate(0 5)"/><circle cx="41" cy="44" r="2.6" fill="#ffd36b"/><g transform="translate(50 50) rotate(-30)"><circle r="6.5" fill="#f0b84a" stroke="#5a3a0c" stroke-width="1.8"/><circle r="2.4" fill="#2a1d14"/><path d="M6 -2h14v4h-3v4h-3v-4h-2v3h-3v-3H6z" fill="#f0b84a" stroke="#5a3a0c" stroke-width="1.5"/></g><g transform="translate(14 14)" fill="#c8962e" stroke="#5a3a0c" stroke-width="1.2"><path d="M-1.6-8h3.2l.7 2.6 2.5-1.4 2.2 2.2-1.4 2.5 2.6.7v3.2l-2.6.7 1.4 2.5-2.2 2.2-2.5-1.4-.7 2.6h-3.2l-.7-2.6-2.5 1.4-2.2-2.2 1.4-2.5-2.6-.7v-3.2l2.6-.7-1.4-2.5 2.2-2.2 2.5 1.4z"/><circle r="2" fill="#2a1d14"/></g></svg>', iconBg: '#2a1d14',
      thumb: 'img/thumbs/escape.webp', thumb2x: 'img/thumbs/escape@2x.webp',
      tech: '2d',
      // no online battle: a room takes 10–20 minutes of quiet thinking, and every player gets the same rooms (planet is the precedent)
      // pause: true — the clear time runs while a room is on screen and stops while hidden or paused
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      // the sum of the best score of each of the 5 rooms (200 + hints up to 400 + time up to 400 = at most 1,000 each). The cap leaves room for more rooms
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n} 点', en: '{n} pts' }, order: 'desc', cap: 10000, maxRate: null },
      rankSource: { key: 'kusoge.escape.save', paths: ['total'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.escape.save', paths: ['total'], agg: 'first', min: 1, num: true, tpl: { ja: '5部屋の合計 {n} 点', en: '5-room total: {n} pts' } },
      keys: {
        'kusoge.escape.save': '{ v:1, rooms:{ r1〜r5:{ s（最高点）, t（最速 ms）, r（最高ランク 1〜4＝C〜S）, nh（ヒントなしでクリア 0/1）, c（クリア回数） } }（クリアした部屋だけ）, total（s の合計＝ランキング）, stats:{ clears, nh, sRank, fast（目安より早い）, hints, done（クリアした部屋の数） }, tut }',
        'kusoge.escape.run': 'とちゅうの部屋（自動保存）{ v:1, ri, S（部屋の状態）, inv[], sel, view, back[], ms, hints:{ なぞの id: 見た数 }, tut, at }。この端末だけ（同期しない）。クリアすると消す',
        'kusoge.escape.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (max; fastest = minPos); the room in progress is not synced
      sync: {
        'kusoge.escape.save': { fields: { rooms: { each: { fields: { s: 'max', t: 'minPos', r: 'max', nh: 'max', c: 'max' } } }, total: 'max', stats: { each: 'max' }, tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'td', order: 15, path: 'td/', added: '2026-11-06',
      title: { ja: '工房まもり', en: 'Workshop Guard' },
      short: { ja: '工房まもり', en: 'Workshop Guard' },
      desc: { ja: '夜ごとに工房へ忍び込む、いたずらなぜんまいおもちゃ。くぎ打ち・ばね砲・のり吹き・竹とんぼ台など6種類のからくり台を並べて、作業台を守るタワーディフェンス。8つのマップ、エンドレス、今日のチャレンジ。', en: 'Every night, mischievous windup toys sneak into the workshop. Line up six kinds of handmade towers — nailers, spring mortars, glue sprayers, copter pads and more — and guard the workbench. 8 maps, endless mode and a daily challenge.' },
      label: { ja: 'タワーディフェンス', en: 'Tower defense' },
      genres: ['action'], tags: ['2d', 'realtime', 'strategy', 'stages', 'endless', 'daily'],
      keywords: { ja: ['タワーディフェンス', 'タワー', 'ディフェンス', '防衛', 'ぜんまい', 'おもちゃ', '工房', '戦略'], en: ['tower defense', 'td', 'defense', 'towers', 'strategy', 'windup', 'toys', 'workshop'] },
      icon: 'img/icons/td.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#4f6a3a"/><path d="M-4 18H22V54H76" fill="none" stroke="#5a4028" stroke-width="17" stroke-linejoin="round"/><path d="M-4 18H22V54H76" fill="none" stroke="#e2cca4" stroke-width="13" stroke-linejoin="round"/><path d="M-4 18H22V54H76" fill="none" stroke="#8a6040" stroke-width="1.2" stroke-dasharray="3 2.5"/><circle cx="47" cy="28" r="13" fill="#c8962e" stroke="#2a1a0a" stroke-width="2"/><circle cx="47" cy="28" r="9" fill="#c9a36a"/><g transform="rotate(130 47 28)"><rect x="44" y="23.5" width="18" height="9" rx="2.5" fill="#9aa3ad" stroke="#2a2f36" stroke-width="1.6"/></g><circle cx="47" cy="28" r="5" fill="#5a6470" stroke="#1a1f26" stroke-width="1.4"/><circle cx="47" cy="28" r="2" fill="#ffd24a"/><g transform="translate(22 50)"><rect x="-6" y="-3" width="12" height="9" rx="3" fill="#d9483b" stroke="#5a1410" stroke-width="1.2"/><circle cy="-7" r="5" fill="#f6d6ae" stroke="#6a4020" stroke-width="1"/><rect x="-4.5" y="-15" width="9" height="6" rx="1" fill="#262634"/><circle cx="-1.8" cy="-7" r=".9" fill="#2a1a10"/><circle cx="1.8" cy="-7" r=".9" fill="#2a1a10"/><path d="M6 0h4M10-3v6" stroke="#e8c25a" stroke-width="2.2" stroke-linecap="round"/></g><path d="M30 46l4-4M31 50l5 0" stroke="#fff3c0" stroke-width="2" stroke-linecap="round"/></svg>', iconBg: '#4f6a3a',
      thumb: 'img/thumbs/td.webp', thumb2x: 'img/thumbs/td@2x.webp',
      tech: '2d',
      // no online battle: a map is a 10-minute plan against the same waves for everyone; the daily challenge is the shared contest
      // pause: true — waves move in real time and stop while hidden or paused (the menu waits for "Resume")
      flags: { ranking: true, achievements: true, daily: true, versus: false, pause: true, stages: true },
      versus: null,
      // one endless or daily run: 10 × wave number × the map's multiplier for every wave survived (campaign games send 0)
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 1000000, maxRate: null },
      rankSource: { key: 'kusoge.td.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.td.save', paths: ['stars'], agg: 'first', min: 1, num: true, tpl: { ja: '星 {n} / 24', en: '{n} / 24 stars' } },
      keys: {
        'kusoge.td.save': '{ v:1, maps:{ m1〜m8:{ st（最高の星 0〜3）, c（クリア回数）, ew（エンドレスで生き残った最高の波）, es（エンドレスの最高点） } }（遊んだマップだけ）, best（es の最大＝ランキング）, stars（st の合計）, stats:{ kills, wins, perfect（★3）, boss, built, early（早く呼んだ波）, endW, daily }, tut }',
        'kusoge.td.run': 'とちゅうのゲーム（波と波のあいだで自動保存）{ v:1, snap:{ v:1, map, mode, mods, gold, lives, wave, cleared, score, rng, t, towers:[[type, slot, lv, br, aim, inv, kills, built]], stats }, mode, dk, tut, speed, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.td.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow; the game in progress is not synced
      sync: {
        'kusoge.td.save': { fields: { maps: { each: { fields: { st: 'max', c: 'max', ew: 'max', es: 'max' } } }, best: 'max', stars: 'max', stats: { each: 'max' }, tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'physics', order: 16, path: 'physics/', added: '2026-11-06',
      title: { ja: 'ころころ工房', en: 'Marble Workshop' },
      short: { ja: 'ころころ工房', en: 'Marble Workshop' },
      desc: { ja: '板・ばね・送風機・ドミノ・シーソー・磁石をならべて「スタート」。毛糸玉を、ねこのかごへ届ける物理パズル。4つの工房に48のレベル、歯車と部品の数で星3つ。', en: 'Place boards, springs, fans, dominoes, seesaws and magnets, then press Start. A physics puzzle: deliver the yarn ball to the cat\'s basket. 48 levels in 4 workshops, three stars for gears and few parts.' },
      label: { ja: '物理パズル', en: 'Physics puzzle' },
      genres: ['puzzle'], tags: ['2d', 'physics', 'stages', 'creative'],
      keywords: { ja: ['物理', '物理パズル', 'パズル', 'からくり', 'ころころ', 'ビー玉', '毛糸玉', 'ねこ', 'ドミノ', 'シーソー'], en: ['physics', 'physics puzzle', 'puzzle', 'contraption', 'marble', 'rube goldberg', 'cat', 'dominoes', 'seesaw', 'gadgets'] },
      icon: 'img/icons/physics.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#e6cfa6"/><g fill="#c9ad80"><circle cx="9" cy="9" r="2"/><circle cx="27" cy="9" r="2"/><circle cx="45" cy="9" r="2"/><circle cx="63" cy="9" r="2"/><circle cx="9" cy="27" r="2"/><circle cx="63" cy="27" r="2"/><circle cx="9" cy="45" r="2"/><circle cx="27" cy="45" r="2"/></g><rect x="0" y="62" width="72" height="10" fill="#7a5230"/><g transform="rotate(-22 30 30)"><rect x="8" y="27" width="40" height="7" rx="2" fill="#e3b475" stroke="#3a210c" stroke-width="1.6"/></g><path d="M46 48h20l-2 14H48z" fill="#b8783e" stroke="#4a2a0c" stroke-width="1.8"/><path d="M50 46l3-6 4 5 4-5 2 6z" fill="#f0a050"/><path d="M52 47q2 1.6 4 0M57 47q2 1.6 4 0" stroke="#3a2210" stroke-width="1.1" fill="none"/><circle cx="20" cy="17" r="8" fill="#e86a8a" stroke="#7a2038" stroke-width="1.6"/><path d="M14 14q6 4 12-1M14 20q6-3 12 1" stroke="#b8385a" stroke-width="1.3" fill="none"/><g transform="translate(57 20)"><circle r="7" fill="#e0a834" stroke="#6a440c" stroke-width="1.5"/><circle r="2.4" fill="#6a440c"/></g><path d="M28 24q10 6 14 20" stroke="#fff3c0" stroke-width="2" stroke-dasharray="2 4" fill="none" stroke-linecap="round"/></svg>', iconBg: '#e6cfa6',
      thumb: 'img/thumbs/physics.webp', thumb2x: 'img/thumbs/physics@2x.webp',
      tech: '2d',
      // no online battle: every level is a quiet puzzle with the same parts for everyone (planet and escape are the precedent)
      // pause: true — the simulation runs in real time after "Start" and stops while hidden or paused
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      // the total of stars (3 per level: goal, all gears, at most the target number of parts; 48 levels = 144). The cap leaves room for more levels
      score: { unit: { ja: '星', en: 'stars' }, fmt: { ja: '★ {n}', en: '★ {n}' }, order: 'desc', cap: 1000, maxRate: null },
      rankSource: { key: 'kusoge.physics.save', paths: ['stars'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.physics.save', paths: ['stars'], agg: 'first', min: 1, num: true, tpl: { ja: '星 {n} / 144', en: '{n} / 144 stars' } },
      keys: {
        'kusoge.physics.save': '{ v:1, lv:{ "1-1"〜"4-12":{ c（クリア回数）, g（歯車ぜんぶ 0/1）, p（部品が目標以内 0/1）, b（最少の部品数）, t（最速 ms） } }（クリアしたレベルだけ）, stars（星の合計＝ランキング）, done（クリアしたレベルの数）, stats:{ runs, wins, gears, par, perfect }, tut }',
        'kusoge.physics.run': 'レベルごとに置いた部品（自動保存）{ v:1, cur（今のレベル）, grid（0/1）, drafts:{ レベル: [[部品, x, y, 角度]] }, at }。この端末だけ（同期しない）',
        'kusoge.physics.sols': 'レベルごとの、この端末でのいちばん良い答え { レベル: { n（星）, parts, p:[[部品, x, y, 角度]] } }（同期しない）',
        'kusoge.physics.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (max; fastest and fewest = minPos); the parts on the board are not synced
      sync: {
        'kusoge.physics.save': { fields: { lv: { each: { fields: { c: 'max', g: 'max', p: 'max', b: 'minPos', t: 'minPos' } } }, stars: 'max', done: 'max', stats: { each: 'max' }, tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'minigolf', order: 17, path: 'minigolf/', added: '2026-11-06',
      title: { ja: 'ころがし工房ゴルフ', en: 'Workshop Mini Golf' },
      short: { ja: 'ころがし工房ゴルフ', en: 'Workshop Mini Golf' },
      desc: { ja: '作業台の上のミニゴルフ。引っぱって、はなして、カップへ。定規の坂、回る歯車、ばね、パイプ、インクだまり。3つのコースに27ホール、練習と今日のホール。', en: 'Mini golf on the workbench. Pull back, let go, sink it. Ruler slopes, spinning gears, springs, pipes and ink puddles. 27 holes on 3 courses, plus practice and a daily hole.' },
      label: { ja: 'ミニゴルフ', en: 'Mini golf' },
      genres: ['action'], tags: ['2d', 'physics', 'sports', 'stages', 'daily'],
      keywords: { ja: ['ゴルフ', 'ミニゴルフ', 'パターゴルフ', 'パター', 'ボール', '物理', 'ホールインワン', '工房', '歯車'], en: ['golf', 'mini golf', 'minigolf', 'putt', 'putting', 'crazy golf', 'ball', 'physics', 'hole in one'] },
      icon: 'img/icons/minigolf.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#c99a5c"/><path d="M0 14h72M0 30h72M0 47h72M0 63h72" stroke="#b8874a" stroke-width="1.2"/><rect x="8" y="7" width="56" height="58" rx="3" fill="#3f9a52" stroke="#e8c58c" stroke-width="5"/><path d="M14 4.5v4M20 4.5v2.5M26 4.5v4M32 4.5v2.5M38 4.5v4M44 4.5v2.5M50 4.5v4M56 4.5v2.5" stroke="#6a4a22" stroke-width="1.2"/><ellipse cx="20" cy="50" rx="8" ry="5.5" fill="#1c2350"/><path d="M15 48q3-2 6-1" stroke="#7a8ad8" stroke-width="1.4" fill="none" stroke-linecap="round"/><g transform="translate(51 26)"><circle r="8" fill="#8a5e14"/><circle r="6" fill="#d8a23a"/><path d="M-11 0H11M0-11V11" stroke="#8a5e14" stroke-width="3.4" stroke-linecap="round"/><path d="M-10 0H10M0-10V10" stroke="#d8a23a" stroke-width="2" stroke-linecap="round"/><circle r="2.2" fill="#8a5e14"/></g><circle cx="25" cy="24" r="4.6" fill="#d9e8d2"/><circle cx="25" cy="24" r="3.6" fill="#0c140c"/><path d="M25 24V8" stroke="#e8b420" stroke-width="2.4" stroke-linecap="round"/><path d="M25.5 8.5l12 3.5-12 4z" fill="#e04848"/><path d="M42 53q-8-10-14-24" stroke="#fff" stroke-width="2" stroke-dasharray="2 3.2" fill="none" stroke-linecap="round"/><circle cx="45" cy="56" r="4.8" fill="#fff" stroke="#8a948a" stroke-width="1"/></svg>', iconBg: '#c99a5c',
      thumb: 'img/thumbs/minigolf.webp', thumb2x: 'img/thumbs/minigolf@2x.webp',
      tech: '2d',
      // no online battle: a round is 9 quiet holes against par; today's hole is the shared contest
      // pause: true — the ball and the gears move in real time and stop while hidden or paused
      flags: { ranking: true, achievements: true, daily: true, versus: false, pause: true, stages: true },
      versus: null,
      // strokes under par: for each course, par minus the best 9-hole round (never below 0), added up (3 courses today: at most 53). The cap leaves room for more courses
      score: { unit: { ja: 'アンダー', en: 'under par' }, fmt: { ja: '{n} アンダー', en: '{n} under par' }, order: 'desc', cap: 1000, maxRate: null },
      rankSource: { key: 'kusoge.minigolf.save', paths: ['under'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.minigolf.save', paths: ['under'], agg: 'first', min: 1, num: true, tpl: { ja: '{n} アンダー', en: '{n} under par' } },
      keys: {
        'kusoge.minigolf.save': '{ v:1, c:{ c1〜c3:{ b（9ホールの最少打数）, r（回った回数）, h:{ "1"〜"9": ホールごとの最少打数 } } }（回ったコースだけ）, under（コースごとの「パー − b」（0未満は0）の合計＝ランキング）, done（回ったコースの数）, stats:{ rounds, holes, strokes, aces, birdies, ink, daily }, tut }',
        'kusoge.minigolf.run': 'とちゅうのラウンドか今日のホール（1打ごとに自動保存）{ v:1, mode（course / daily）, ci, hi, card[], dk, seed, snap:{ tick, x, y, strokes, pen, lx, ly }, pend（転がっている1打 [角度, 強さ]）, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.minigolf.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (rounds and counts: max; fewest strokes: minPos); the round in progress is not synced
      sync: {
        'kusoge.minigolf.save': { fields: { c: { each: { fields: { b: 'minPos', r: 'max', h: { each: 'minPos' } } } }, under: 'max', done: 'max', stats: { each: 'max' }, tut: 'max' }, rest: 'newest' },
      },
    },
  ];

  // ゲームごとの実績（P3-3。形と条件の書き方は common/achievements.js の先頭）。各ゲームの .first は achievements.js が足す。
  // 条件は、そのゲームが今保存している記録（rec）と、今出しているイベント（ev）だけを使う（さかのぼって判定できるように、なるべく rec）。
  var SCORE_MODES = ['normal', 'daily'];
  function best(key, gte) { return { any: [{ rec: { key: key }, gte: gte }, { ev: 'play_end', field: 'score', gte: gte, modes: SCORE_MODES }] }; }
  var STAGES = function (key) { return { key: key, paths: ['best', 'level'], agg: 'first', offset: -1 }; };
  var ACHIEVEMENTS = {
    neji: [
      { id: 'neji.lv10', tier: 1, icon: 'check', title: { ja: 'ネジまわし', en: 'Screwdriver' }, desc: { ja: 'LEVEL 10 をクリア', en: 'Clear LEVEL 10' }, when: { rec: { key: 'nejihodoki3d.maxLevel', offset: -1 }, gte: 10 } },
      { id: 'neji.lv30', tier: 2, icon: 'check', title: { ja: 'ほどき上手', en: 'Unscrew Pro' }, desc: { ja: 'LEVEL 30 をクリア', en: 'Clear LEVEL 30' }, when: { rec: { key: 'nejihodoki3d.maxLevel', offset: -1 }, gte: 30 } },
      { id: 'neji.lv50', tier: 3, icon: 'trophy', title: { ja: 'LEVEL 50', en: 'LEVEL 50' }, desc: { ja: 'LEVEL 50 をクリア', en: 'Clear LEVEL 50' }, when: { rec: { key: 'nejihodoki3d.maxLevel', offset: -1 }, gte: 50 } },
      { id: 'neji.lv100', tier: 4, icon: 'trophy', title: { ja: 'ネジの名人', en: 'Screw Master' }, desc: { ja: 'LEVEL 100 をクリア', en: 'Clear LEVEL 100' }, when: { rec: { key: 'nejihodoki3d.maxLevel', offset: -1 }, gte: 100 }, grantsTitle: { ja: 'ネジの名人', en: 'Screw Master' } },
      { id: 'neji.stars50', tier: 2, icon: 'star', title: { ja: '星あつめ', en: 'Star Gatherer' }, desc: { ja: '星を合わせて50個', en: 'Earn 50 stars in total' }, when: { rec: { key: 'nejihodoki3d.stars', measure: 'sum' }, gte: 50 } },
      { id: 'neji.perfect20', tier: 3, icon: 'star', title: { ja: '完ぺきな手順', en: 'Flawless Order' }, desc: { ja: '★3 のレベルを20個', en: 'Get ★3 on 20 levels' }, when: { rec: { key: 'nejihodoki3d.stars', measure: 'countGte', min: 3 }, gte: 20 } },
      { id: 'neji.daily7', tier: 2, icon: 'star', title: { ja: '毎日ネジ', en: 'Daily Screws' }, desc: { ja: 'ネジほどきのデイリーを7回クリア', en: 'Clear 7 Unscrew 3D dailies' }, when: { any: [{ rec: { key: 'nejihodoki3d.daily', measure: 'countGte', min: 1 }, gte: 7 }, { stat: 'gameDaily', gte: 7 }] } },
    ],
    blocks: [
      { id: 'blocks.s1k', tier: 1, icon: 'star', title: { ja: '千点はめ', en: '1k Fitter' }, desc: { ja: '1回で1,000点', en: 'Score 1,000 in one game' }, when: best('kusoge.blocks.best', 1000) },
      { id: 'blocks.s10k', tier: 2, icon: 'star', title: { ja: '一万点はめ', en: '10k Fitter' }, desc: { ja: '1回で10,000点', en: 'Score 10,000 in one game' }, when: best('kusoge.blocks.best', 10000) },
      { id: 'blocks.s50k', tier: 3, icon: 'trophy', title: { ja: '五万点はめ', en: '50k Fitter' }, desc: { ja: '1回で50,000点', en: 'Score 50,000 in one game' }, when: best('kusoge.blocks.best', 50000) },
      { id: 'blocks.s100k', tier: 4, icon: 'trophy', title: { ja: 'ブロック職人', en: 'Block Artisan' }, desc: { ja: '1回で100,000点', en: 'Score 100,000 in one game' }, when: best('kusoge.blocks.best', 100000), grantsTitle: { ja: 'ブロック職人', en: 'Block Artisan' } },
      { id: 'blocks.combo5', tier: 2, icon: 'star', title: { ja: '連続消し', en: 'Combo x5' }, desc: { ja: '1回で5連続コンボ', en: 'Reach a 5x combo in one game' }, when: { ev: 'play_end', field: 'stats.maxCombo', gte: 5, modes: SCORE_MODES } },
      { id: 'blocks.lines50', tier: 2, icon: 'check', title: { ja: '50列そうじ', en: '50 Lines' }, desc: { ja: '1回で50列を消す', en: 'Clear 50 lines in one game' }, when: { ev: 'play_end', field: 'stats.lines', gte: 50, modes: SCORE_MODES } },
      { id: 'blocks.daily1', tier: 1, icon: 'star', title: { ja: '今日のはめ', en: 'Daily Fit' }, desc: { ja: 'ブロックはめのデイリーをクリア', en: 'Clear a Block Fit daily' }, when: { stat: 'gameDaily', gte: 1 } },
    ],
    drop: [
      { id: 'drop.s5k', tier: 1, icon: 'star', title: { ja: '五千点タワー', en: '5k Tower' }, desc: { ja: '1回で5,000点', en: 'Score 5,000 in one game' }, when: best('kusoge.drop.best', 5000) },
      { id: 'drop.s30k', tier: 2, icon: 'star', title: { ja: '三万点タワー', en: '30k Tower' }, desc: { ja: '1回で30,000点', en: 'Score 30,000 in one game' }, when: best('kusoge.drop.best', 30000) },
      { id: 'drop.s100k', tier: 3, icon: 'trophy', title: { ja: '十万点タワー', en: '100k Tower' }, desc: { ja: '1回で100,000点', en: 'Score 100,000 in one game' }, when: best('kusoge.drop.best', 100000), grantsTitle: { ja: '塔の主', en: 'Tower Lord' } },
      { id: 'drop.lines40', tier: 2, icon: 'check', title: { ja: '40列けし', en: '40 Lines' }, desc: { ja: '1回で40列を消す', en: 'Clear 40 lines in one game' }, when: { ev: 'play_end', field: 'stats.lines', gte: 40, modes: SCORE_MODES } },
      { id: 'drop.lv10', tier: 2, icon: 'restart', title: { ja: 'スピード10', en: 'Speed 10' }, desc: { ja: '1回でレベル10まで', en: 'Reach level 10 in one game' }, when: { ev: 'play_end', field: 'stats.level', gte: 10, modes: SCORE_MODES } },
      { id: 'drop.soroi1', tier: 1, icon: 'star', title: { ja: 'いっしょく', en: 'One Color' }, desc: { ja: '1色でそろえた列を消す', en: 'Clear a single-color row' }, when: { ev: 'play_end', field: 'stats.soroi', gte: 1, modes: SCORE_MODES } },
      { id: 'drop.soroi5', tier: 3, icon: 'trophy', hidden: true, title: { ja: '色の魔術師', en: 'Color Wizard' }, desc: { ja: '1回で1色の列を5回消す', en: 'Clear 5 single-color rows in one game' }, when: { ev: 'play_end', field: 'stats.soroi', gte: 5, modes: SCORE_MODES } },
      { id: 'drop.daily1', tier: 1, icon: 'star', title: { ja: '今日のタワー', en: 'Daily Tower' }, desc: { ja: 'おちものタワーのデイリーをクリア', en: 'Clear a Drop Tower daily' }, when: { stat: 'gameDaily', gte: 1 } },
    ],
    raft: [
      { id: 'raft.d5', tier: 1, icon: 'check', title: { ja: '5日生きのびる', en: 'Five Days Afloat' }, desc: { ja: '5日生きのびる', en: 'Survive 5 days' }, when: best('kusoge.raft.best', 5) },
      { id: 'raft.d15', tier: 2, icon: 'check', title: { ja: '漂流の15日', en: 'Fifteen Days Adrift' }, desc: { ja: '15日生きのびる', en: 'Survive 15 days' }, when: best('kusoge.raft.best', 15) },
      { id: 'raft.d30', tier: 3, icon: 'trophy', title: { ja: '海の暮らし', en: 'Sea Life' }, desc: { ja: '30日生きのびる', en: 'Survive 30 days' }, when: best('kusoge.raft.best', 30) },
      { id: 'raft.d60', tier: 4, icon: 'trophy', title: { ja: 'いかだの主', en: 'Raft Lord' }, desc: { ja: '60日生きのびる', en: 'Survive 60 days' }, when: best('kusoge.raft.best', 60), grantsTitle: { ja: 'いかだの主', en: 'Raft Lord' } },
      { id: 'raft.catch50', tier: 1, icon: 'star', title: { ja: '拾いもの名人', en: 'Beachcomber' }, desc: { ja: '1回の航海で漂流物を50個拾う', en: 'Grab 50 pieces of debris in one voyage' }, when: { ev: 'play_end', field: 'stats.caught', gte: 50, modes: ['normal'] } },
      { id: 'raft.raid3', tier: 2, icon: 'trophy', title: { ja: '海賊よけ', en: 'Pirate Repeller' }, desc: { ja: '1回の航海で海賊を3回撃退', en: 'Repel pirates 3 times in one voyage' }, when: { ev: 'play_end', field: 'stats.raidsWon', gte: 3, modes: ['normal'] } },
      { id: 'raft.crew5', tier: 2, icon: 'play', title: { ja: 'にぎやかないかだ', en: 'Full Crew' }, desc: { ja: '仲間を5人にする', en: 'Have 5 crew members' }, when: { ev: 'play_end', field: 'stats.crew', gte: 5, modes: ['normal'] } },
    ],
    gates: [
      { id: 'gates.st5', tier: 1, icon: 'check', title: { ja: 'ゲート突破', en: 'Gate Breaker' }, desc: { ja: 'ステージ5をクリア', en: 'Clear stage 5' }, when: { rec: { key: 'kusoge.gates.save', path: 'best' }, gte: 5 } },
      { id: 'gates.st15', tier: 2, icon: 'check', title: { ja: '前線の兵', en: 'Frontliner' }, desc: { ja: 'ステージ15をクリア', en: 'Clear stage 15' }, when: { rec: { key: 'kusoge.gates.save', path: 'best' }, gte: 15 } },
      { id: 'gates.st30', tier: 3, icon: 'trophy', title: { ja: '歴戦の隊長', en: 'Veteran Captain' }, desc: { ja: 'ステージ30をクリア', en: 'Clear stage 30' }, when: { rec: { key: 'kusoge.gates.save', path: 'best' }, gte: 30 }, grantsTitle: { ja: '歴戦の隊長', en: 'Veteran Captain' } },
      { id: 'gates.hq5', tier: 2, icon: 'settings', title: { ja: '司令部をきたえる', en: 'HQ Level 5' }, desc: { ja: '司令部をレベル5にする', en: 'Upgrade the HQ to level 5' }, when: { rec: { key: 'kusoge.gates.save', path: 'bld.hq' }, gte: 5 } },
      { id: 'gates.hero10', tier: 2, icon: 'star', title: { ja: '頼れるヒーロー', en: 'Trusted Hero' }, desc: { ja: 'ヒーローをレベル10にする', en: 'Raise a hero to level 10' }, when: { rec: { key: 'kusoge.gates.save', path: 'heroes', each: 'lv', measure: 'max' }, gte: 10 } },
      { id: 'gates.star1', tier: 2, icon: 'star', title: { ja: '星の昇格', en: 'Star Promotion' }, desc: { ja: 'ヒーローの星を上げる', en: 'Promote a hero to 1 star' }, when: { rec: { key: 'kusoge.gates.save', path: 'heroes', each: 'star', measure: 'max' }, gte: 1 } },
      { id: 'gates.runs50', tier: 1, icon: 'play', title: { ja: '出撃50回', en: '50 Sorties' }, desc: { ja: '50回出撃する', en: 'Go on 50 runs' }, when: { rec: { key: 'kusoge.gates.save', path: 'runs' }, gte: 50 } },
    ],
    n59049: [
      { id: 'n59049.s10k', tier: 1, icon: 'star', title: { ja: '一万点の立体', en: '10k Cube' }, desc: { ja: '1回で10,000点', en: 'Score 10,000 in one game' }, when: best('kusoge.n59049.best', 10000) },
      { id: 'n59049.s100k', tier: 2, icon: 'star', title: { ja: '十万点の立体', en: '100k Cube' }, desc: { ja: '1回で100,000点', en: 'Score 100,000 in one game' }, when: best('kusoge.n59049.best', 100000) },
      { id: 'n59049.s1m', tier: 3, icon: 'trophy', title: { ja: '百万点の立体', en: 'Million Cube' }, desc: { ja: '1回で1,000,000点', en: 'Score 1,000,000 in one game' }, when: best('kusoge.n59049.best', 1000000) },
      { id: 'n59049.t243', tier: 1, icon: 'check', title: { ja: '243', en: '243' }, desc: { ja: '243 を作る', en: 'Make a 243' }, when: { rec: { key: 'kusoge.n59049.bestTile' }, gte: 243 } },
      { id: 'n59049.t2187', tier: 2, icon: 'check', title: { ja: '2187', en: '2187' }, desc: { ja: '2187 を作る', en: 'Make a 2187' }, when: { rec: { key: 'kusoge.n59049.bestTile' }, gte: 2187 } },
      { id: 'n59049.t6561', tier: 3, icon: 'trophy', title: { ja: '6561', en: '6561' }, desc: { ja: '6561 を作る', en: 'Make a 6561' }, when: { rec: { key: 'kusoge.n59049.bestTile' }, gte: 6561 } },
      { id: 'n59049.t59049', tier: 4, icon: 'trophy', title: { ja: '59049', en: '59049' }, desc: { ja: '59049 を作る', en: 'Make a 59049' }, when: { any: [{ rec: { key: 'kusoge.n59049.bestTile' }, gte: 59049 }, { ev: 'progress', key: 'tile59049', gte: 1 }] }, grantsTitle: { ja: '三の十乗', en: 'Three to the Tenth' } },
    ],
    water: [
      { id: 'water.st10', tier: 1, icon: 'check', title: { ja: '色水みならい', en: 'Pourer' }, desc: { ja: '10ステージをクリア', en: 'Clear 10 stages' }, when: { rec: STAGES('kusoge.water.save'), gte: 10 } },
      { id: 'water.st50', tier: 2, icon: 'check', title: { ja: '注ぎ上手', en: 'Steady Hand' }, desc: { ja: '50ステージをクリア', en: 'Clear 50 stages' }, when: { rec: STAGES('kusoge.water.save'), gte: 50 } },
      { id: 'water.st100', tier: 3, icon: 'trophy', title: { ja: '百の試験管', en: 'Hundred Tubes' }, desc: { ja: '100ステージをクリア', en: 'Clear 100 stages' }, when: { rec: STAGES('kusoge.water.save'), gte: 100 } },
      { id: 'water.st200', tier: 4, icon: 'trophy', title: { ja: '色水の名人', en: 'Sort Master' }, desc: { ja: '200ステージをクリア', en: 'Clear 200 stages' }, when: { rec: STAGES('kusoge.water.save'), gte: 200 }, grantsTitle: { ja: '色水の名人', en: 'Sort Master' } },
      { id: 'water.star3', tier: 1, icon: 'star', title: { ja: 'むだなし', en: 'No Waste' }, desc: { ja: '★3 でクリア', en: 'Clear a stage with ★3' }, when: { any: [{ ev: 'stage_clear', field: 'stars', gte: 3, modes: SCORE_MODES }, { rec: { key: 'kusoge.water.save', path: 'stars', measure: 'countGte', min: 3 }, gte: 1 }] } },
      { id: 'water.stars20', tier: 2, icon: 'star', title: { ja: '星の試験管', en: 'Starry Tubes' }, desc: { ja: '★3 のステージを20個', en: 'Get ★3 on 20 stages' }, when: { rec: { key: 'kusoge.water.save', path: 'stars', measure: 'countGte', min: 3 }, gte: 20 } },
      { id: 'water.daily3', tier: 2, icon: 'star', title: { ja: '今日の色水', en: 'Daily Sorter' }, desc: { ja: 'いろみず分けのデイリーを3回クリア', en: 'Clear 3 Color Water Sort dailies' }, when: { stat: 'gameDaily', gte: 3 } },
    ],
    parking: [
      { id: 'parking.st10', tier: 1, icon: 'check', title: { ja: '出庫係', en: 'Valet' }, desc: { ja: '10ステージをクリア', en: 'Clear 10 stages' }, when: { rec: STAGES('kusoge.parking.save'), gte: 10 } },
      { id: 'parking.st50', tier: 2, icon: 'check', title: { ja: '駐車場の整理係', en: 'Lot Manager' }, desc: { ja: '50ステージをクリア', en: 'Clear 50 stages' }, when: { rec: STAGES('kusoge.parking.save'), gte: 50 } },
      { id: 'parking.st100', tier: 3, icon: 'trophy', title: { ja: '渋滞知らず', en: 'Jam Breaker' }, desc: { ja: '100ステージをクリア', en: 'Clear 100 stages' }, when: { rec: STAGES('kusoge.parking.save'), gte: 100 } },
      { id: 'parking.st200', tier: 4, icon: 'trophy', title: { ja: '出庫の名人', en: 'Car Out Master' }, desc: { ja: '200ステージをクリア', en: 'Clear 200 stages' }, when: { rec: STAGES('kusoge.parking.save'), gte: 200 }, grantsTitle: { ja: '出庫の名人', en: 'Car Out Master' } },
      { id: 'parking.star3', tier: 1, icon: 'star', title: { ja: '最短ルート', en: 'Shortest Route' }, desc: { ja: '★3 でクリア', en: 'Clear a stage with ★3' }, when: { any: [{ ev: 'stage_clear', field: 'stars', gte: 3, modes: SCORE_MODES }, { rec: { key: 'kusoge.parking.save', path: 'stars', measure: 'countGte', min: 3 }, gte: 1 }] } },
      { id: 'parking.stars20', tier: 2, icon: 'star', title: { ja: '星の駐車場', en: 'Starry Lot' }, desc: { ja: '★3 のステージを20個', en: 'Get ★3 on 20 stages' }, when: { rec: { key: 'kusoge.parking.save', path: 'stars', measure: 'countGte', min: 3 }, gte: 20 } },
      { id: 'parking.daily3', tier: 2, icon: 'star', title: { ja: '今日の出庫', en: 'Daily Valet' }, desc: { ja: 'くるま出しのデイリーを3回クリア', en: 'Clear 3 Car Out dailies' }, when: { stat: 'gameDaily', gte: 3 } },
    ],
    hole: [
      { id: 'hole.win1', tier: 1, icon: 'trophy', title: { ja: 'いちばんの穴', en: 'Top Hole' }, desc: { ja: 'CPU 戦で1位になる', en: 'Finish 1st in a CPU battle' }, when: { rec: { key: 'kusoge.hole.save', path: 'wins' }, gte: 1 } },
      { id: 'hole.win10', tier: 2, icon: 'trophy', title: { ja: '街のぬし', en: 'City Boss' }, desc: { ja: 'CPU 戦で10回1位になる', en: 'Finish 1st in 10 CPU battles' }, when: { rec: { key: 'kusoge.hole.save', path: 'wins' }, gte: 10 } },
      { id: 'hole.pts1k', tier: 2, icon: 'star', title: { ja: '千点のみこみ', en: '1,000 Swallowed' }, desc: { ja: '1回で1,000点', en: 'Score 1,000 in one battle' }, when: { rec: { key: 'kusoge.hole.save', paths: ['best.maxPts', 'best.matchPts'], agg: 'max' }, gte: 1000 } },
      { id: 'hole.size12', tier: 2, icon: 'star', title: { ja: '大あな', en: 'Huge Hole' }, desc: { ja: '穴の大きさを12にする', en: 'Grow your hole to size 12' }, when: { rec: { key: 'kusoge.hole.save', path: 'best.maxSize' }, gte: 12 } },
      { id: 'hole.camp10', tier: 3, icon: 'globe', title: { ja: 'まちめぐり', en: 'City Tour' }, desc: { ja: 'まちめぐりで10都市をクリア', en: 'Clear 10 cities in City Tour' }, when: { rec: { key: 'kusoge.hole.save', path: 'camp.stars', measure: 'countGte', min: 1 }, gte: 10 } },
      { id: 'hole.camp30', tier: 4, icon: 'trophy', title: { ja: 'あなぼこ市長', en: 'Hole Mayor' }, desc: { ja: 'まちめぐりの星を30個あつめる', en: 'Collect 30 City Tour stars' }, when: { rec: { key: 'kusoge.hole.save', path: 'camp.stars', measure: 'sum' }, gte: 30 }, grantsTitle: { ja: 'あなぼこ市長', en: 'Hole Mayor' } },
      { id: 'hole.skins4', tier: 2, icon: 'theme', title: { ja: 'おしゃれな穴', en: 'Stylish Hole' }, desc: { ja: 'スキンを4つ持つ', en: 'Own 4 skins' }, when: { rec: { key: 'kusoge.hole.save', path: 'skins.owned', measure: 'count' }, gte: 4 } },
      { id: 'hole.online1', tier: 2, icon: 'globe', title: { ja: 'ネットの大穴', en: 'Online Champion' }, desc: { ja: 'オンライン対戦で1位になる', en: 'Finish 1st in an online battle' }, when: { rec: { key: 'kusoge.hole.save', path: 'online.wins' }, gte: 1 } },
    ],
    hitsumabushi: [
      { id: 'hitsumabushi.day1', tier: 1, icon: 'check', title: { ja: '初日の営業', en: 'Opening Day' }, desc: { ja: '1日の営業を終える', en: 'Finish a business day' }, when: { rec: { key: 'kusoge.hitsumabushi.save', path: 'stats.days' }, gte: 1 } },
      { id: 'hitsumabushi.s300', tier: 1, icon: 'star', title: { ja: '繁盛のきざし', en: 'Busy Counter' }, desc: { ja: '1日で300点', en: 'Score 300 in one day' }, when: { any: [{ rec: { key: 'kusoge.hitsumabushi.save', path: 'best' }, gte: 300 }, { ev: 'play_end', field: 'score', gte: 300, modes: SCORE_MODES }] } },
      { id: 'hitsumabushi.s1k', tier: 2, icon: 'star', title: { ja: '千点の厨房', en: '1,000-Point Kitchen' }, desc: { ja: '1日で1,000点', en: 'Score 1,000 in one day' }, when: { any: [{ rec: { key: 'kusoge.hitsumabushi.save', path: 'best' }, gte: 1000 }, { ev: 'play_end', field: 'score', gte: 1000, modes: SCORE_MODES }] } },
      { id: 'hitsumabushi.perfect', tier: 1, icon: 'star', title: { ja: '極上の一膳', en: 'Exquisite Bowl' }, desc: { ja: '「極上」の皿をお出しする', en: 'Serve an exquisite dish' }, when: { any: [{ rec: { key: 'kusoge.hitsumabushi.save', path: 'stats.perfect' }, gte: 1 }, { ev: 'play_end', field: 'stats.perfect', gte: 1, modes: SCORE_MODES }] } },
      { id: 'hitsumabushi.dish100', tier: 2, icon: 'check', title: { ja: '百膳', en: 'Hundred Bowls' }, desc: { ja: '合わせて100皿お出しする', en: 'Serve 100 dishes in total' }, when: { rec: { key: 'kusoge.hitsumabushi.save', path: 'stats.served' }, gte: 100 } },
      { id: 'hitsumabushi.usual3', tier: 2, icon: 'star', title: { ja: 'いつもの、ですね', en: 'The Usual' }, desc: { ja: '常連さんの「いつもの」を聞かずに3回当てる', en: 'Get a regular\'s usual right 3 times without asking' }, when: { rec: { key: 'kusoge.hitsumabushi.save', path: 'stats.remembered' }, gte: 3 } },
      { id: 'hitsumabushi.rank2', tier: 2, icon: 'trophy', title: { ja: '町の人気店', en: 'Town Favorite' }, desc: { ja: '店の格を「町の人気店」にする', en: 'Grow your shop into the town favorite' }, when: { rec: { key: 'kusoge.hitsumabushi.save', path: 'rank' }, gte: 2 } },
      { id: 'hitsumabushi.rank4', tier: 4, icon: 'trophy', title: { ja: '鯱見町の老舗', en: 'Oldest Shop in Town' }, desc: { ja: '店の格を「老舗」にする', en: 'Make your shop a long-established one' }, when: { rec: { key: 'kusoge.hitsumabushi.save', path: 'rank' }, gte: 4 }, grantsTitle: { ja: '老舗の主人', en: 'Old Shop Master' } },
      { id: 'hitsumabushi.daily1', tier: 1, icon: 'star', title: { ja: '今日の一膳', en: 'Daily Bowl' }, desc: { ja: 'ひつまぶし工房のデイリーをクリア', en: 'Clear a Hitsumabushi Workshop daily' }, when: { stat: 'gameDaily', gte: 1 } },
    ],
    planet: [
      { id: 'planet.life', tier: 1, icon: 'star', title: { ja: '生命の誕生', en: 'Spark of Life' }, desc: { ja: '星に生命が生まれる', en: 'Life appears on a planet' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.life' }, gte: 1 } },
      { id: 'planet.goe', tier: 2, icon: 'globe', title: { ja: '酸素の空', en: 'Breath of Oxygen' }, desc: { ja: '大酸化イベントを起こす', en: 'Trigger the Great Oxidation' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.goe' }, gte: 1 } },
      { id: 'planet.thaw', tier: 2, icon: 'globe', title: { ja: '雪だるまの春', en: 'Snowball Thaw' }, desc: { ja: '全球凍結から抜け出す', en: 'Escape a snowball planet' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.thaw' }, gte: 1 } },
      { id: 'planet.civ', tier: 3, icon: 'trophy', title: { ja: '文明のあけぼの', en: 'First Cities' }, desc: { ja: '自分の星に文明が生まれる', en: 'A civilization rises on your planet' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.civ' }, gte: 1 } },
      { id: 'planet.space', tier: 3, icon: 'star', title: { ja: '宇宙時代', en: 'Space Age' }, desc: { ja: '文明が技術100に届く', en: 'A civilization reaches technology 100' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.space' }, gte: 1 } },
      { id: 'planet.sc1', tier: 1, icon: 'check', title: { ja: 'はじめてのお題', en: 'First Scenario' }, desc: { ja: 'シナリオを1つクリア', en: 'Clear a scenario' }, when: { rec: { key: 'kusoge.planet.save', path: 'sc', measure: 'count' }, gte: 1 } },
      { id: 'planet.sc8', tier: 3, icon: 'trophy', title: { ja: '星の設計者', en: 'Planet Architect' }, desc: { ja: '8つのシナリオをすべてクリア', en: 'Clear all 8 scenarios' }, when: { rec: { key: 'kusoge.planet.save', path: 'sc', measure: 'count' }, gte: 8 }, grantsTitle: { ja: '星の設計者', en: 'Planet Architect' } },
      { id: 'planet.pts5k', tier: 2, icon: 'star', title: { ja: '五千点の宇宙', en: '5,000-Point Cosmos' }, desc: { ja: 'シナリオ合計5,000点', en: 'Reach a scenario total of 5,000' }, when: { rec: { key: 'kusoge.planet.save', path: 'total' }, gte: 5000 } },
    ],
    hitblow: [
      { id: 'hitblow.win1', tier: 1, icon: 'check', title: { ja: 'はじめての正解', en: 'First Solve' }, desc: { ja: 'ヒットアンドブローで答えを当てる', en: 'Solve a Hit & Blow puzzle' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.wins' }, gte: 1 } },
      { id: 'hitblow.fast4', tier: 2, icon: 'star', title: { ja: '4手の名探偵', en: 'Four-Move Detective' }, desc: { ja: '4つの答えを4回以内で当てる', en: 'Solve a 4-long answer in 4 tries or fewer' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.fast4' }, gte: 1 } },
      { id: 'hitblow.win5', tier: 2, icon: 'trophy', title: { ja: '5けた破り', en: 'Five-Lock Breaker' }, desc: { ja: '「むずかしい」（5つ）を当てる', en: 'Solve a Hard (5-long) answer' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.win5' }, gte: 1 } },
      { id: 'hitblow.dup', tier: 3, icon: 'star', title: { ja: '重なりを見抜く', en: 'Seeing Double' }, desc: { ja: '同じ記号ありの答えを当てる', en: 'Solve an answer with repeated symbols allowed' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.winDup' }, gte: 1 } },
      { id: 'hitblow.lucky', tier: 3, icon: 'star', hidden: true, title: { ja: 'ひと目で正解', en: 'Lucky Hunch' }, desc: { ja: '1回目の推理で当てる', en: 'Solve it with your very first guess' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.lucky' }, gte: 1 } },
      { id: 'hitblow.cpu3', tier: 3, icon: 'trophy', title: { ja: '機械に勝つ', en: 'Beat the Machine' }, desc: { ja: '「つよい」CPU に勝つ', en: 'Beat the Strong CPU' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.cpu3' }, gte: 1 } },
      { id: 'hitblow.streak3', tier: 2, icon: 'star', title: { ja: '3日つづけて推理', en: 'Three-Day Sleuth' }, desc: { ja: '今日のチャレンジを3日つづけて当てる', en: "Solve today's challenge 3 days in a row" }, when: { rec: { key: 'kusoge.hitblow.save', path: 'daily.max' }, gte: 3 } },
      { id: 'hitblow.wins30', tier: 3, icon: 'trophy', title: { ja: '名推理30', en: 'Thirty Deductions' }, desc: { ja: '合わせて30回当てる', en: 'Solve 30 puzzles in total' }, when: { rec: { key: 'kusoge.hitblow.save', path: 'stats.wins' }, gte: 30 }, grantsTitle: { ja: '名探偵', en: 'Master Detective' } },
      { id: 'hitblow.s3k', tier: 2, icon: 'star', title: { ja: '三千点の推理', en: '3,000-Point Logic' }, desc: { ja: '1問で3,000点', en: 'Score 3,000 on one puzzle' }, when: { any: [{ rec: { key: 'kusoge.hitblow.save', path: 'best' }, gte: 3000 }, { ev: 'play_end', field: 'score', gte: 3000, modes: SCORE_MODES }] } },
    ],
    shogi: [
      { id: 'shogi.win1', tier: 1, icon: 'check', title: { ja: '初勝利', en: 'First Win' }, desc: { ja: 'CPU に勝つ', en: 'Beat the CPU' }, when: { rec: { key: 'kusoge.shogi.save', paths: ['cpu.l1.w', 'cpu.l2.w', 'cpu.l3.w', 'cpu.l4.w', 'cpu.l5.w'], agg: 'max' }, gte: 1 } },
      { id: 'shogi.lv3', tier: 2, icon: 'star', title: { ja: '中級突破', en: 'Medium Cleared' }, desc: { ja: '「中級」の CPU に勝つ', en: 'Beat the Medium CPU' }, when: { rec: { key: 'kusoge.shogi.save', path: 'cpu.l3.w' }, gte: 1 } },
      { id: 'shogi.lv4', tier: 3, icon: 'trophy', title: { ja: '上級者', en: 'Strong Player' }, desc: { ja: '「上級」の CPU に勝つ', en: 'Beat the Hard CPU' }, when: { rec: { key: 'kusoge.shogi.save', path: 'cpu.l4.w' }, gte: 1 } },
      { id: 'shogi.top1', tier: 4, icon: 'trophy', title: { ja: '最強を倒す', en: 'Giant Slayer' }, desc: { ja: '最強の CPU に平手・待ったなしで勝つ', en: 'Beat the strongest CPU in an even game without take-backs' }, when: { rec: { key: 'kusoge.shogi.save', path: 'top' }, gte: 1 }, grantsTitle: { ja: '名人', en: 'Meijin' } },
      { id: 'shogi.on1', tier: 2, icon: 'globe', title: { ja: 'ネット将棋', en: 'Online Victory' }, desc: { ja: 'オンライン対局で勝つ', en: 'Win an online match' }, when: { rec: { key: 'kusoge.shogi.save', path: 'on.w' }, gte: 1 } },
      { id: 'shogi.on10', tier: 3, icon: 'globe', title: { ja: '十番勝負', en: 'Ten Online Wins' }, desc: { ja: 'オンライン対局で10勝', en: 'Win 10 online matches' }, when: { rec: { key: 'kusoge.shogi.save', path: 'on.w' }, gte: 10 } },
      { id: 'shogi.mate1', tier: 1, icon: 'star', title: { ja: '詰みを見つけた', en: 'Found the Mate' }, desc: { ja: '詰将棋を1問解く', en: 'Solve a tsume puzzle' }, when: { rec: { key: 'kusoge.shogi.save', path: 'mate.s', measure: 'count' }, gte: 1 } },
      { id: 'shogi.mate8', tier: 3, icon: 'trophy', title: { ja: '詰将棋の達人', en: 'Tsume Master' }, desc: { ja: '詰将棋を8問ぜんぶ解く', en: 'Solve all 8 tsume puzzles' }, when: { rec: { key: 'kusoge.shogi.save', path: 'mate.s', measure: 'count' }, gte: 8 } },
    ],
    escape: [
      { id: 'escape.r1', tier: 1, icon: 'check', title: { ja: '作業場を出た', en: 'Out of the Workroom' }, desc: { ja: '部屋1「作業場」から脱出', en: 'Escape room 1, the Workbench Room' }, when: { rec: { key: 'kusoge.escape.save', path: 'rooms.r1.c' }, gte: 1 } },
      { id: 'escape.r3', tier: 2, icon: 'star', title: { ja: '灯りをともして', en: 'Let There Be Light' }, desc: { ja: '部屋3「灯りの部屋」から脱出', en: 'Escape room 3, the Lantern Room' }, when: { rec: { key: 'kusoge.escape.save', path: 'rooms.r3.c' }, gte: 1 } },
      { id: 'escape.all', tier: 3, icon: 'trophy', title: { ja: '一人前の職人', en: 'True Craftsperson' }, desc: { ja: '5つの部屋すべてから脱出', en: 'Escape all five rooms' }, when: { rec: { key: 'kusoge.escape.save', path: 'rooms', measure: 'count' }, gte: 5 }, grantsTitle: { ja: '一人前の職人', en: 'True Craftsperson' } },
      { id: 'escape.nohint', tier: 2, icon: 'star', title: { ja: '自分の力で', en: 'All on My Own' }, desc: { ja: 'ヒントを見ずに部屋から脱出', en: 'Escape a room without any hints' }, when: { rec: { key: 'kusoge.escape.save', path: 'stats.nh' }, gte: 1 } },
      { id: 'escape.rankS', tier: 2, icon: 'trophy', title: { ja: 'Sランクの手さばき', en: 'S-Rank Hands' }, desc: { ja: 'ランクSで部屋から脱出', en: 'Escape a room with rank S' }, when: { rec: { key: 'kusoge.escape.save', path: 'stats.sRank' }, gte: 1 } },
      { id: 'escape.fast3', tier: 3, icon: 'star', title: { ja: '早足の見習い', en: 'Quick Apprentice' }, desc: { ja: '目安の時間より早く3回脱出', en: 'Beat the par time 3 times' }, when: { rec: { key: 'kusoge.escape.save', path: 'stats.fast' }, gte: 3 } },
      { id: 'escape.t4k', tier: 3, icon: 'trophy', title: { ja: '親方の太鼓判', en: "The Master's Seal" }, desc: { ja: '5部屋の合計4,000点', en: 'Reach a 5-room total of 4,000' }, when: { rec: { key: 'kusoge.escape.save', path: 'total' }, gte: 4000 } },
    ],
    td: [
      { id: 'td.m1', tier: 1, icon: 'check', title: { ja: '工房の見張り番', en: 'On Watch' }, desc: { ja: 'マップ1「土間の通り道」を守る', en: 'Defend map 1, The Earthen Floor' }, when: { rec: { key: 'kusoge.td.save', path: 'maps.m1.c' }, gte: 1 } },
      { id: 'td.m4', tier: 2, icon: 'check', title: { ja: '分かれ道の守り', en: 'Fork Keeper' }, desc: { ja: 'マップ4「ふたまた廊下」を守る', en: 'Defend map 4, the Forked Hallway' }, when: { rec: { key: 'kusoge.td.save', path: 'maps.m4.c' }, gte: 1 } },
      { id: 'td.all', tier: 3, icon: 'trophy', title: { ja: '工房の守り神', en: 'Guardian of the Workshop' }, desc: { ja: '8つのマップをすべて守る', en: 'Defend all 8 maps' }, when: { rec: { key: 'kusoge.td.save', path: 'maps', measure: 'countGte', each: 'c', min: 1 }, gte: 8 }, grantsTitle: { ja: '工房の守り神', en: 'Workshop Guardian' } },
      { id: 'td.stars24', tier: 4, icon: 'star', title: { ja: '部品ひとつ盗ませない', en: 'Not a Single Screw' }, desc: { ja: '全マップで★3（星24個）', en: '★3 on every map (24 stars)' }, when: { rec: { key: 'kusoge.td.save', path: 'stars' }, gte: 24 } },
      { id: 'td.boss', tier: 2, icon: 'trophy', title: { ja: '大王たおし', en: 'King Toppler' }, desc: { ja: 'ぜんまい大王を倒す', en: 'Defeat the Clockwork King' }, when: { rec: { key: 'kusoge.td.save', path: 'stats.boss' }, gte: 1 } },
      { id: 'td.w30', tier: 3, icon: 'star', title: { ja: '終わらない夜', en: 'The Endless Night' }, desc: { ja: 'エンドレスで30の波を生き残る', en: 'Survive 30 waves in endless' }, when: { rec: { key: 'kusoge.td.save', path: 'stats.endW' }, gte: 30 } },
      { id: 'td.k1000', tier: 2, icon: 'star', title: { ja: 'おもちゃ千体', en: 'A Thousand Toys' }, desc: { ja: 'おもちゃを合わせて1,000体止める', en: 'Stop 1,000 toys in total' }, when: { rec: { key: 'kusoge.td.save', path: 'stats.kills' }, gte: 1000 } },
      { id: 'td.s10k', tier: 3, icon: 'trophy', title: { ja: '一万点の守り', en: '10k Defense' }, desc: { ja: 'エンドレスで10,000点', en: 'Score 10,000 in endless' }, when: { rec: { key: 'kusoge.td.save', path: 'best' }, gte: 10000 } },
    ],
    physics: [
      { id: 'physics.l1', tier: 1, icon: 'check', title: { ja: 'ねこに届けた', en: 'Special Delivery' }, desc: { ja: 'レベル1-1をクリア', en: 'Clear level 1-1' }, when: { rec: { key: 'kusoge.physics.save', path: 'lv.1-1.c' }, gte: 1 } },
      { id: 'physics.w1', tier: 2, icon: 'check', title: { ja: '作業台の見習い', en: 'Bench Apprentice' }, desc: { ja: '12のレベルをクリア', en: 'Clear 12 levels' }, when: { rec: { key: 'kusoge.physics.save', path: 'done' }, gte: 12 } },
      { id: 'physics.all', tier: 3, icon: 'trophy', title: { ja: 'からくり名人', en: 'Contraption Master' }, desc: { ja: '48のレベルをすべてクリア', en: 'Clear all 48 levels' }, when: { rec: { key: 'kusoge.physics.save', path: 'done' }, gte: 48 }, grantsTitle: { ja: 'からくり名人', en: 'Contraption Master' } },
      { id: 'physics.stars144', tier: 4, icon: 'star', title: { ja: '親方の太鼓判', en: "The Master's Stamp" }, desc: { ja: '星を144個すべて集める', en: 'Collect all 144 stars' }, when: { rec: { key: 'kusoge.physics.save', path: 'stars' }, gte: 144 } },
      { id: 'physics.gears50', tier: 2, icon: 'star', title: { ja: '歯車あつめ', en: 'Gear Collector' }, desc: { ja: '歯車を合わせて50個集める', en: 'Collect 50 gears in total' }, when: { rec: { key: 'kusoge.physics.save', path: 'stats.gears' }, gte: 50 } },
      { id: 'physics.par20', tier: 3, icon: 'star', title: { ja: '少ない部品で', en: 'Less Is More' }, desc: { ja: '部品を目標の数以内で20回クリア', en: 'Clear within the target parts 20 times' }, when: { rec: { key: 'kusoge.physics.save', path: 'stats.par' }, gte: 20 } },
    ],
    minigolf: [
      { id: 'minigolf.h1', tier: 1, icon: 'check', title: { ja: 'カップイン', en: 'In the Cup' }, desc: { ja: 'はじめてカップに入れる', en: 'Sink your first putt' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.holes' }, gte: 1 } },
      { id: 'minigolf.r1', tier: 1, icon: 'check', title: { ja: '作業台を一周', en: 'Round the Bench' }, desc: { ja: '「定規の作業台」を9ホール回る', en: 'Finish a round on Ruler Bench' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'c.c1.r' }, gte: 1 } },
      { id: 'minigolf.all', tier: 3, icon: 'trophy', title: { ja: '工房のゴルファー', en: 'Workshop Golfer' }, desc: { ja: '3つのコースをすべて回る', en: 'Finish a round on all 3 courses' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 3 }, grantsTitle: { ja: '工房のゴルファー', en: 'Workshop Golfer' } },
      { id: 'minigolf.ace', tier: 2, icon: 'star', title: { ja: 'ホールインワン', en: 'Hole in One' }, desc: { ja: '1打でカップに入れる（練習はのぞく）', en: 'Make a hole in one (not in practice)' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.aces' }, gte: 1 } },
      { id: 'minigolf.ace10', tier: 3, icon: 'star', title: { ja: '一打の名人', en: 'Ace Maker' }, desc: { ja: 'ホールインワンを合わせて10回', en: 'Make 10 holes in one in total' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.aces' }, gte: 10 } },
      { id: 'minigolf.under1', tier: 2, icon: 'star', title: { ja: 'パーより少なく', en: 'Under Par' }, desc: { ja: '9ホールをパーより少ない打数で回る', en: 'Finish a 9-hole round under par' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'under' }, gte: 1 } },
      { id: 'minigolf.under15', tier: 4, icon: 'trophy', title: { ja: '親方の腕前', en: "The Master's Touch" }, desc: { ja: '3つのコースのアンダーを合わせて15にする', en: 'Reach 15 under par across the courses' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'under' }, gte: 15 } },
      { id: 'minigolf.daily3', tier: 2, icon: 'star', title: { ja: '今日のひと打ち', en: 'Daily Putter' }, desc: { ja: '今日のホールを3回遊ぶ', en: 'Play 3 daily holes' }, when: { any: [{ rec: { key: 'kusoge.minigolf.save', path: 'stats.daily' }, gte: 3 }, { stat: 'gameDaily', gte: 3 }] } },
    ],
  };
  for (var ai = 0; ai < GAMES.length; ai++) GAMES[ai].achievements = ACHIEVEMENTS[GAMES[ai].id] || [];

  // どのゲームにも属さない、ゲームのページが使う共有のキー
  var SHARED_SYNC = {
    // versus.js：{ [game]: { plays, wins, best } }。どれも増えるだけなので、ゲームとフィールドごとに大きい方
    'kusoge.vs.stats': { each: { fields: { plays: 'max', wins: 'max', best: 'max' } } },
  };

  var byIdMap = {};
  for (var i = 0; i < GAMES.length; i++) byIdMap[GAMES[i].id] = GAMES[i];

  var REGISTRY = {
    version: VERSION,
    games: GAMES,
    genres: GENRES,
    sharedSync: SHARED_SYNC,
    byId: function (id) { return Object.prototype.hasOwnProperty.call(byIdMap, id) ? byIdMap[id] : null; },
    ids: function () { return GAMES.map(function (g) { return g.id; }); },
  };

  root.KOBO_GAMES = GAMES;
  root.KOBO_GENRES = GENRES;
  root.KOBO_SHARED_SYNC = SHARED_SYNC;
  root.KOBO_REGISTRY = REGISTRY;
  if (typeof module === 'object' && module && module.exports) module.exports = REGISTRY;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
