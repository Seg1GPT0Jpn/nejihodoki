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
//   flags                            ranking / achievements / daily / versus / pause / stages（今そのページにあるものだけ true）
//   versus                           'common'（common/versus.js）| 'own'（独自の RTDB 対戦）| null
//   score                            { unit, fmt, order, cap, maxRate } ランキングの表示と上限
//   rankSource                       ランキングに送る値の出どころ（KoboPlatform.rankValue が計算する）
//   record                           ハブのカードに出す自分の記録（KoboPlatform.recordValue / recordText）
//   keys                             そのゲームが使う localStorage のキーの全部と、その中身の説明
//   sync                             同期するキーと、マージのしかた（下の「同期のしかた」）
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
      flags: { ranking: true, achievements: false, daily: true, versus: true, pause: false, stages: true },
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
      flags: { ranking: true, achievements: false, daily: true, versus: true, pause: false, stages: false },
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
      flags: { ranking: true, achievements: false, daily: true, versus: true, pause: true, stages: false },
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
      flags: { ranking: true, achievements: false, daily: false, versus: true, pause: true, stages: false },
      versus: 'common',
      score: { unit: { ja: '日生存', en: 'days' }, fmt: null, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.raft.best', paths: null, offset: 0 },
      record: { key: 'kusoge.raft.best', paths: null, min: 1, tpl: { ja: '最長 {n} 日生存', en: 'Longest: {n} days survived' } },
      keys: {
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
      flags: { ranking: true, achievements: false, daily: false, versus: true, pause: true, stages: true },
      versus: 'common',
      score: { unit: { ja: 'ステージ', en: 'stage' }, fmt: { ja: 'STAGE {n}', en: 'STAGE {n}' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.gates.save', paths: ['best', 'bestStage'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.gates.save', paths: ['best', 'bestStage', 'stage'], agg: 'or', min: 1, tpl: { ja: 'ステージ {n} まで到達', en: 'Reached stage {n}' } },
      keys: {
        'kusoge.gates.save': '{ v:2, best, stage, coins, mat, exp, bld:{…}, heroes:{ id:{ lv, star, cards } }, sel:[…], runs }（旧2D版は gates の migrate() が読む）',
      },
      // R4：コイン・素材・経験値・カード（使うと減るもの）と選択は newest、最高ステージ・建物・ヒーローのレベルと星は max
      sync: {
        'kusoge.gates.save': {
          version: 'v',
          fields: {
            v: 'max', best: 'max', stage: 'newest', coins: 'newest', mat: 'newest', exp: 'newest', runs: 'max',
            bld: { each: 'max' },
            heroes: { each: { fields: { lv: 'max', star: 'max', cards: 'newest' } } },
            sel: 'newest', migrated: 'max',
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
      flags: { ranking: true, achievements: false, daily: true, versus: true, pause: false, stages: false },
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
      genres: ['puzzle'], tags: ['2d', 'stages', 'relax', 'versus'],
      keywords: { ja: ['色水', 'いろみず', '試験管', 'ソート', 'パズル'], en: ['water', 'sort', 'color', 'tubes', 'puzzle'] },
      icon: 'img/icons/water.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#1f3340"/><g stroke="#cfe8f5" stroke-width="2" fill="none"><path d="M14 12 V54 a6 6 0 0 0 12 0 V12"/><path d="M30 12 V54 a6 6 0 0 0 12 0 V12"/><path d="M46 12 V54 a6 6 0 0 0 12 0 V12"/></g><rect x="15" y="40" width="10" height="20" rx="4" fill="#e93d82"/><rect x="15" y="30" width="10" height="10" fill="#30a46c"/><rect x="31" y="44" width="10" height="16" rx="4" fill="#30a46c"/><rect x="47" y="36" width="10" height="24" rx="4" fill="#3e8ef7"/><rect x="47" y="28" width="10" height="8" fill="#e93d82"/></svg>', iconBg: '#1f3340',
      thumb: 'img/thumbs/water.webp', thumb2x: 'img/thumbs/water@2x.webp',
      tech: '2d',
      flags: { ranking: true, achievements: false, daily: false, versus: true, pause: false, stages: true },
      versus: 'common',
      score: { unit: { ja: 'ステージ', en: 'stages' }, fmt: { ja: '{n} ステージ', en: '{n} stages' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.water.save', paths: ['best', 'level'], agg: 'first', offset: -1 },
      record: { key: 'kusoge.water.save', paths: ['best', 'level'], agg: 'or', min: 2, tpl: { ja: 'ステージ {n} まで到達', en: 'Reached stage {n}' } },
      keys: {
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
      flags: { ranking: true, achievements: false, daily: true, versus: true, pause: false, stages: true },
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
      flags: { ranking: true, achievements: false, daily: false, versus: true, pause: true, stages: true },
      versus: 'own',
      score: { unit: { ja: '点', en: 'pts' }, fmt: null, order: 'desc', cap: 1000000, maxRate: null },
      // R10：matchPts は「最高順位を取ったときの点数」で、最高点ではない。最高点は best.maxPts（P2-hole が足す）。
      // 古い保存には maxPts がないので、実際に取った点数である matchPts との大きい方を使う（下がることはない）。
      rankSource: { key: 'kusoge.hole.save', paths: ['best.maxPts', 'best.matchPts'], agg: 'max', offset: 0 },
      // R9：今のハブは best.score / best.size を読むが、そのフィールドはない（いつも空）。ランキングと同じ最高点を出す
      record: { key: 'kusoge.hole.save', paths: ['best.maxPts', 'best.matchPts'], agg: 'max', min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best: {n} pts' } },
      keys: {
        'kusoge.hole.save': '{ best:{ matchRank, matchPts, maxPts?, soloPct, soloStars, maxSize }, coins, skins:{ owned:[…], sel }, perks:{ size, speed }, wins, camp:{ open, stars:[10], best:[10] }, online:{ plays, wins, best }, city }',
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
          },
        },
      },
    },
  ];

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
