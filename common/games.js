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
    { id: 'study', ja: '学習', en: 'Study' },
    { id: 'music', ja: '音楽', en: 'Music' },
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
      genres: ['puzzle'], tags: ['2d', 'endless', 'casual', 'versus', 'stages'],
      keywords: { ja: ['ブロック', 'パズル', '8×8', 'ならべ', 'ステージ', 'タイムアタック'], en: ['block', 'blocks', 'puzzle', 'fit', 'grid'] },
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
        'kusoge.blocks.x': 'ステージの星とタイムアタックのベスト { v:1, s:[15ステージの星0〜3], ta }（端末内だけ。同期しない・ランキングに入らない）',
      },
      sync: { 'kusoge.blocks.best': 'max', 'kusoge.blocks.state': 'newest' },
    },
    {
      id: 'drop', order: 3, path: 'drop/', added: '2026-11-03',
      title: { ja: 'おちものタワー', en: 'Drop Tower' },
      short: { ja: 'おちものタワー', en: 'Drop Tower' },
      desc: { ja: '落ちてくるブロックで横一列をそろえて消す。1色でそろえると大量得点。', en: 'Fill rows with falling blocks to clear them. Single-color rows score big.' },
      label: { ja: '落ちもの', en: 'Falling blocks' },
      genres: ['falling'], tags: ['2d', 'endless', 'realtime', 'versus', 'daily', 'stages'],
      keywords: { ja: ['落ちもの', 'おちもの', 'ブロック', 'テトロ', 'ステージ', 'スプリント'], en: ['falling', 'blocks', 'drop', 'tower', 'lines', 'stages', 'sprint'] },
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
        'kusoge.drop.x': 'ステージの星とスプリントのベスト { v:1, s:[12ステージの星0〜3], sp: ミリ秒（小さいほど良い） }（端末内だけ。同期しない・ランキングに入らない）',
      },
      sync: { 'kusoge.drop.best': 'max', 'kusoge.drop.state': 'newest' },
    },
    {
      id: 'raft', order: 4, path: 'raft/', added: '2026-11-03',
      title: { ja: 'いかだ暮らし', en: 'Raft Life' },
      short: { ja: 'いかだ暮らし', en: 'Raft Life' },
      desc: { ja: '水没した世界で漂流物を拾い、イカダを広げて生き延びる。サメに注意。', en: 'In a flooded world, grab floating debris, grow your raft and survive. Watch out for the shark.' },
      label: { ja: 'サバイバル', en: 'Survival' },
      genres: ['survival'], tags: ['3d', 'realtime', 'crafting', 'versus', 'stages'],
      keywords: { ja: ['いかだ', 'イカダ', 'サバイバル', '海', 'サメ', '航海'], en: ['raft', 'survival', 'ocean', 'shark', 'craft', 'voyage'] },
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
        'kusoge.raft.voy': '途中の航海（kusoge.raft.save と同じ形に voy:{id}・vm を足したもの）。クリアか失敗で消す。端末だけ・同期しない',
        'kusoge.raft.x': '航海の星 { v:1, s:[8航海の星0〜3], c }（端末内だけ。同期しない・ランキングに入らない）',
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
        'kusoge.gates.x': 'ミッションの星と最短クリア秒 { v:1, s:[12ミッションの星0〜3], t:[最短秒], c }（端末内だけ。同期しない・ランキングに入らない）',
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
        'kusoge.n59049.x': 'ステージの星とラッシュのベスト { v:1, s:[12ステージの星0〜3], r, c }（端末内だけ。同期しない・ランキングに入らない）',
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
        'kusoge.water.x': 'チャレンジの星とスプリントのベスト { v:1, s:[12ステージの星0〜3], sp: ミリ秒（小さいほど良い） }（端末内だけ。同期しない・ランキングに入らない）',
        'kusoge.water.marks': '色の目印（\'1\' = オン）。端末だけ',
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
        'kusoge.parking.x': 'ミッションの星とラッシュのベスト { v:1, s:[12ミッションの星0〜3], r: ラッシュの最高点 }（端末内だけ。同期しない・ランキングに入らない）',
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
        'kusoge.hole.x': 'ミッションの星・ベストと最大コンボ { v:1, s:[12ミッションの星0〜3], b:[12ミッションのベスト], c: 最大コンボ }（端末内だけ。同期しない・ランキングに入らない）',
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
        'kusoge.hitsumabushi.x': '特別営業の星とベスト { v:1, s:[10日の星0〜3], b:[10日のベスト], c: さいだいれんぞく }（端末内だけ。同期しない・ランキングに入らない）',
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
      desc: { ja: '宇宙から小さな星をつくり（山・海・火山・雨・いのち・彗星）、降りて歩いて、育った生き物や結晶・化石を見つける。マグマから宇宙の時代まで。理科をまなぶ章つき。2〜4人で同じ星を育てて点を競うオンライン対戦も。', en: 'Shape a little planet from space (mountains, seas, volcanoes, rain, life, comets), then dive down, walk around it and discover the creatures, crystals and fossils that grew there. From magma to the space age, with science lessons. Plus an online score battle: grow the same planet as 2–4 players.' },
      label: { ja: 'シミュレーション', en: 'Simulation' },
      genres: ['simulation'], tags: ['3d', 'sandbox', 'science', 'stages', 'explore', 'versus'],
      keywords: { ja: ['惑星', 'わくせい', '地球', '気候', '温暖化', '進化', '生命', '文明', 'シミュレーション', '科学', '理科', '探検', '図鑑'], en: ['planet', 'earth', 'climate', 'warming', 'evolution', 'life', 'civilization', 'simulation', 'science', 'explore', 'learning'] },
      icon: 'img/icons/planet.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#0b1430"/><g fill="#dfe8ff"><circle cx="9" cy="12" r="1"/><circle cx="20" cy="6" r=".8"/><circle cx="64" cy="58" r="1"/><circle cx="8" cy="62" r=".8"/></g><circle cx="58" cy="14" r="12" fill="#ffd36b" opacity=".18"/><circle cx="58" cy="14" r="7" fill="#ffd36b"/><circle cx="34" cy="39" r="23" fill="#2a78c2"/><path d="M16 31c5-6 11-2 15-6 5-4 12 0 14 5-4 5-9 2-13 6-4 5-10 6-16 3z" fill="#4fb35a"/><path d="M30 52c4-3 9-1 12-4 3 2 3 6-1 8-4 1-8 0-11-4z" fill="#4fb35a"/><path d="M25 18c3-1 6-2 10-2" stroke="#f4f8fc" stroke-width="5" stroke-linecap="round"/><path d="M20 21c5-3 12-4 19-3M40 44c4 0 7-1 10-3" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/><path d="M13 47a23 23 0 0 0 42-5" stroke="#05122b" stroke-width="9" fill="none" opacity=".35"/><circle cx="34" cy="39" r="23" fill="none" stroke="#9fd6ff" stroke-width="1.5" opacity=".7"/></svg>', iconBg: '#0b1430',
      thumb: 'img/thumbs/planet.webp', thumb2x: 'img/thumbs/planet@2x.webp',
      tech: '3d',
      // online battle (common/versus.js): 3 minutes, everyone grows the same seeded young planet (PSim.vsWorld) while the match clock runs 3M years a second; score = variety of life ×4 + green land %×3 + finds ×80 + evolution 120/stage + climate ≤150 (PSim.vsScore)
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: true, stages: true },
      versus: 'common',
      // the sum of the best score of each of the 8 scenarios (up to 1,000 each)
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n} 点', en: '{n} pts' }, order: 'desc', cap: 10000, maxRate: null },
      rankSource: { key: 'kusoge.planet.save', paths: ['total'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.planet.save', paths: ['total'], agg: 'first', min: 1, num: true, tpl: { ja: 'お題の合計 {n} 点', en: 'Challenge total: {n} pts' } },
      keys: {
        'kusoge.planet.save': '{ v:1, sc:{ <シナリオid（cradle, snow, green, gate, goe, sun, warm, dawn）>:{ best（0〜1000）, stars（1〜3） } }（クリアしたものだけ）, total（best の合計＝ランキング）, stats:{ life, goe, thaw, civ, space, ext, collapse, worlds, clears, maxMyr, combos（見つけたコンボの数）, ends（宇宙時代のエンディング）, ms（1つの星で届いた節目の最大）, dex（図鑑の数）, spark（✦の合計。道具と星のひな形が開く）, walk（星を一周した）, wonders（たずねたふしぎな星の数）, learn（まなぶモードで終えた章の数。ランキングには入らない）, sculpt（道具を使った回数） }, tut, cmb（見つけたコンボの id をカンマで）, dex（図鑑：k:<見つけたものの種類> と s:<星のseed>:<番号>:<海1/陸0>（生き物）をカンマで、300まで）, learn（終えた章の id をカンマで）, won（たずねたふしぎな星の id をカンマで） }',
        'kusoge.planet.world': '自由モードの星 { v:1, name?, t（年）, p:{ dist, size, water, n2, co2, seed }, T[32], A, O, ch4, o2, wl, lost, iceL/iceO/veg/reach（64×32 を1文字ずつ。reach はいのちの広がり）, reachOn, plates[], bumps[], craters[], volcs[], life{}, civ{}, ev[], flags{}, combos[], ms{ <節目>: 年 }, boost, aur, surp, nextSurp, spd, at, ops（彫刻：1つ4文字の列。緯度・経度・高さ km）, wet（雨をふらせた所）, marks[]（見つけるもの）, found[]（見つけた id）, markN, drift, shelf[]（わたしの銀河のほかの星。同じ形で5つまで） }。15秒ごと・止めたとき・隠れたときに書く。2026-11 より前の保存（reach・ms なし）は、いのちが全体にいるものとして読み、節目は今の状態から作り直す。彫刻より前の保存（ops なし）は、プレートが前の速さで動き、見つけるものはまだない',
        'kusoge.planet.q': 'この端末の画質（\'hi\' 高画質／\'lo\' かるい。同期しない）',
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
        'kusoge.hitblow.x': 'ミッションの星・ベストの回数とひとりの連勝 { v:1, s:[12ミッションの星0〜3], b:[12ミッションのベストの回数], ws（連勝）, wm（最高の連勝） }（端末内だけ。同期しない・ランキングに入らない）',
        'kusoge.hitblow.state': '途中のゲーム（ひとり・デイリー）{ v:1, kind, cfg, secret, rows:[[推理, H, B]], cur, ms, dk, memo:{ s[], p[] }, tut, （ミッション：mi, gv, hp, hn） }。この端末だけ（同期しない）。終わると消す',
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
      desc: { ja: '旅に出た親方が残した、5つのからくり部屋。歯車・時計・光と色・はかり・星の手がかりを集めて、屋根裏まで抜け出す脱出ゲーム。ヒントは3段階。5部屋を出ると、箱を押す床とびん数えのなぞがあるおまけの部屋が開く。', en: 'The Master left on a journey and locked five rooms with gadgets. Gather clues — gears, clocks, light and color, scales, stars — and escape up to the attic. Hints come in 3 steps. Clear all five to open a bonus cellar with a crate-pushing floor.' },
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
        'kusoge.escape.save': '{ v:1, rooms:{ r1〜r6（r6＝おまけの部屋。total には入らない）:{ s（最高点）, t（最速 ms）, r（最高ランク 1〜4＝C〜S）, nh（ヒントなしでクリア 0/1）, c（クリア回数） } }（クリアした部屋だけ）, total（r1〜r5 の s の合計＝ランキング。r6 は入れない）, stats:{ clears, nh, sRank, fast（目安より早い）, hints, done（クリアした部屋の数） }, tut }',
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
        'kusoge.physics.save': '{ v:1, lv:{ "1-1"〜"4-12":{ c（クリア回数）, g（歯車ぜんぶ 0/1）, p（部品が目標以内 0/1）, b（最少の部品数）, t（最速 ms） } }（クリアしたレベルだけ）, stars（星の合計＝ランキング）, done（クリアしたレベルの数）, stats:{ runs, wins, gears, par, perfect, made（作ってクリアを確かめたレベルの数）, shared（共有したレベルの数） }, tut }',
        'kusoge.physics.run': 'レベルごとに置いた部品（自動保存）{ v:1, cur（今のレベル）, grid（0/1）, drafts:{ レベル: [[部品, x, y, 角度]] }, at }。この端末だけ（同期しない）',
        'kusoge.physics.sols': 'レベルごとの、この端末でのいちばん良い答え { レベル: { n（星）, parts, p:[[部品, x, y, 角度]] } }（同期しない）',
        'kusoge.physics.howto': '遊び方を見た（\'1\'）',
        'kusoge.physics.mine': '「つくる」で作った自分のレベル（最大30）{ v:1, nick（共有するときの名前）, list:[{ id, at, def（physics/codec.js の形）, proof（クリアした部品 [{ t, x, y, a }]）, vf（クリアしたときのレベルの指紋）, tp（ためしたときの部品）, sh（共有した 0/1） }] }。この端末だけ（同期しない）',
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
      desc: { ja: '作業台の上のミニゴルフ。引っぱって、はなして、カップへ。定規の坂、回る歯車、ばね、パイプ、インクだまり。スイッチの扉とはね戸も。5つの段・22コース・198ホール、だんだんむずかしくなる。練習と今日のホール、オンライン対戦も。', en: 'Mini golf on the workbench. Pull back, let go, sink it. Ruler slopes, spinning gears, springs, pipes, ink puddles, switch doors and flap gates. 198 holes on 22 courses in 5 tiers that get really hard, plus practice and a daily hole.' },
      label: { ja: 'ミニゴルフ', en: 'Mini golf' },
      genres: ['action'], tags: ['2d', 'physics', 'sports', 'stages', 'daily', 'versus'],
      keywords: { ja: ['ゴルフ', 'ミニゴルフ', 'パターゴルフ', 'パター', 'ボール', '物理', 'ホールインワン', '工房', '歯車'], en: ['golf', 'mini golf', 'minigolf', 'putt', 'putting', 'crazy golf', 'ball', 'physics', 'hole in one'] },
      icon: 'img/icons/minigolf.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#c99a5c"/><path d="M0 14h72M0 30h72M0 47h72M0 63h72" stroke="#b8874a" stroke-width="1.2"/><rect x="8" y="7" width="56" height="58" rx="3" fill="#3f9a52" stroke="#e8c58c" stroke-width="5"/><path d="M14 4.5v4M20 4.5v2.5M26 4.5v4M32 4.5v2.5M38 4.5v4M44 4.5v2.5M50 4.5v4M56 4.5v2.5" stroke="#6a4a22" stroke-width="1.2"/><ellipse cx="20" cy="50" rx="8" ry="5.5" fill="#1c2350"/><path d="M15 48q3-2 6-1" stroke="#7a8ad8" stroke-width="1.4" fill="none" stroke-linecap="round"/><g transform="translate(51 26)"><circle r="8" fill="#8a5e14"/><circle r="6" fill="#d8a23a"/><path d="M-11 0H11M0-11V11" stroke="#8a5e14" stroke-width="3.4" stroke-linecap="round"/><path d="M-10 0H10M0-10V10" stroke="#d8a23a" stroke-width="2" stroke-linecap="round"/><circle r="2.2" fill="#8a5e14"/></g><circle cx="25" cy="24" r="4.6" fill="#d9e8d2"/><circle cx="25" cy="24" r="3.6" fill="#0c140c"/><path d="M25 24V8" stroke="#e8b420" stroke-width="2.4" stroke-linecap="round"/><path d="M25.5 8.5l12 3.5-12 4z" fill="#e04848"/><path d="M42 53q-8-10-14-24" stroke="#fff" stroke-width="2" stroke-dasharray="2 3.2" fill="none" stroke-linecap="round"/><circle cx="45" cy="56" r="4.8" fill="#fff" stroke="#8a948a" stroke-width="1"/></svg>', iconBg: '#c99a5c',
      thumb: 'img/thumbs/minigolf.webp', thumb2x: 'img/thumbs/minigolf@2x.webp',
      tech: '2d',
      // online battle (common/versus.js): 4 minutes, everyone plays the same seeded run of holes (MinigolfVsPlan), par 300 +100/−60 per stroke, +200 ace, a hole not sunk = 0
      // pause: true — the ball and the gears move in real time and stop while hidden or paused
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: true, stages: true },
      versus: 'common',
      // stars over every hole (best of the course rounds): 1 holed out, 2 within par + 1, 3 within par. 22 courses × 9 holes × 3 = at most 594 (cap 1000).
      // (until 2026-11 the ranking was "strokes under par"; the 3 old courses were re-tuned, so the new value starts from the new records)
      score: { unit: { ja: '星', en: 'stars' }, fmt: { ja: '★{n}', en: '★{n}' }, order: 'desc', cap: 1000, maxRate: null },
      rankSource: { key: 'kusoge.minigolf.save', paths: ['stars'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.minigolf.save', paths: ['stars'], agg: 'first', min: 1, num: true, tpl: { ja: '★{n}', en: '★{n}' } },
      keys: {
        'kusoge.minigolf.save': '{ v:2, c:{ c1〜c22:{ r（回った回数）, t（9ホールの最少打数）, s:{ "1"〜"9": ホールごとの最少打数 }, b・h（v1 の古いホールの記録。もう使わない） } }（回ったコースだけ）, stars（全ホールの星の合計＝ランキング。カップイン1・パー＋1以内2・パー以内3）, under（コースごとの「パー − t」（0未満は0）の合計）, done（回ったコースの数）, stats:{ rounds, holes, strokes, aces, birdies, ink, daily, under（パーより少なく回ったラウンド） }, tut }',
        'kusoge.minigolf.run': 'とちゅうのラウンドか今日のホール（1打ごとに自動保存）{ v:2（v1 は古いホールなので読まない）, mode（course / daily）, ci, hi, card[], dk, seed, snap:{ tick, x, y, strokes, pen, lx, ly, open（開いた扉） }, pend（転がっている1打 [角度, 強さ]）, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.minigolf.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (rounds and counts: max; fewest strokes: minPos); the round in progress is not synced
      sync: {
        'kusoge.minigolf.save': { fields: { c: { each: { fields: { b: 'minPos', r: 'max', h: { each: 'minPos' }, t: 'minPos', s: { each: 'minPos' } } } }, stars: 'max', under: 'max', done: 'max', stats: { each: 'max' }, tut: 'max', v: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'trade', order: 18, path: 'trade/', added: '2026-11-19',
      title: { ja: '貿易ゲーム', en: 'Trade Game' },
      short: { ja: '貿易ゲーム', en: 'Trade Game' },
      desc: { ja: '8つの国に分かれて、資源と技術で製品をつくり世界市場に輸出する。国のタイプはくじで決まる。交渉・値下がり・援助・災害や航路の混雑を通して、豊かな国と貧しい国の差を考える地理総合の教材。8つのミッションと3段階のむずかしさ、日本語と英語。', en: 'Eight countries turn resources and technology into products for the world market. Your country type is drawn by lot. Negotiate, ride out price drops, disasters and shipping jams, take on eight missions, and think about why rich and poor countries drift apart — a geography class simulation.' },
      label: { ja: '貿易シミュレーション', en: 'Trade simulation' },
      genres: ['simulation'], tags: ['2d', 'education', 'negotiation', 'economy'],
      keywords: { ja: ['貿易', '貿易ゲーム', '地理', '地理総合', '南北問題', 'フェアトレード', 'ODA', '交渉', '経済', '授業'], en: ['trade', 'trading game', 'geography', 'economy', 'fair trade', 'aid', 'negotiation', 'class', 'simulation'] },
      icon: 'img/icons/trade.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#0f1a2e"/><circle cx="36" cy="36" r="13" fill="#0b0c0f" stroke="#4589ff" stroke-width="2"/><circle cx="36" cy="36" r="21" fill="none" stroke="#4589ff" stroke-opacity=".35" stroke-dasharray="2 3"/><path d="M12 18Q36 4 60 18M12 54Q36 68 60 54" fill="none" stroke="#78a9ff" stroke-width="1.6"/><circle cx="12" cy="18" r="5" fill="#d2a106"/><circle cx="60" cy="18" r="5" fill="#ff7eb6"/><circle cx="12" cy="54" r="5" fill="#08bdba"/><circle cx="60" cy="54" r="5" fill="#a56eff"/><path d="M31 39l4-6 3 3 4-6" fill="none" stroke="#f2f3f5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', iconBg: '#0f1a2e',
      thumb: 'img/thumbs/trade.webp', thumb2x: 'img/thumbs/trade@2x.webp',
      tech: '2d',
      // no ranking: the country type is drawn by lot, so comparing money between players would not be fair.
      // pause: true — the 40-minute clock runs in real time and stops while hidden, negotiating or paused
      flags: { ranking: false, achievements: true, daily: false, versus: false, pause: true, stages: false },
      versus: null,
      score: { unit: { ja: 'ドル', en: 'dollars' }, fmt: { ja: '${n}', en: '${n}' }, order: 'desc', cap: 10000000, maxRate: null },
      rankSource: { key: 'kusoge.trade.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.trade.save', paths: ['best'], agg: 'first', min: 1, num: true, tpl: { ja: '最高 ${n}', en: 'Best ${n}' } },
      keys: {
        'kusoge.trade.save': '{ v:1, plays（遊んだ回数）, best（最後に持っていたお金の最高）, bestX（はじめのお金からの倍率×10 の最高）, types:{ A〜D: その国のタイプで遊んだ回数 }, typesN（遊んだタイプの数）, deals（交渉で成立した取引の合計）, dTop（途上国で4位以内に入った回数）, wins（1位になった回数） }。この端末だけ（同期しない）',
        'kusoge.trade.name': '自分の国の名前（10文字まで）',
        'kusoge.trade.view': '表示（real：現実の資源と産業 / class：授業の紙と道具）',
        'kusoge.trade.speed': '時間の速さ（fast / normal / slow）',
        'kusoge.trade.x': 'ミッション8つの記録 { v:1, s:[★0〜3 ×8], b:[ベストの倍率×10 ×8] }。この端末だけ（同期しない）。ランキング・実績・ベストには入らない',
        'kusoge.trade.diff': 'むずかしさ（e / n / h）',
        'kusoge.trade.ev': 'ランダムなできごと（on / off）',
      },
      // not synced: the record is per device (the class plays on shared devices)
      sync: {},
    },
    {
      id: 'cards', order: 19, path: 'cards/', added: '2026-11-24',
      title: { ja: 'トランプ広場', en: 'Card Table' },
      short: { ja: 'トランプ広場', en: 'Card Table' },
      desc: { ja: 'ババ抜き・ジジ抜き・神経衰弱・七並べ・大富豪・ポーカー・ブラックジャックをCPUと、ソリティア（クロンダイク・フリーセル・スパイダー）をひとりで遊べるトランプ広場。ヒント・何度でも戻せる・今日の配りつき。', en: 'Seven card games against CPU players (Old Maid, Jiji-nuki, Concentration, Sevens, Daifugo, Poker, Blackjack) plus solo Solitaire: Klondike, FreeCell and Spider, with hints, unlimited undo and a daily deal.' },
      label: { ja: 'トランプ', en: 'Card games' },
      genres: ['board'], tags: ['2d', 'turn', 'cards', 'casual'],
      keywords: { ja: ['トランプ', 'カード', 'ババ抜き', '神経衰弱', '七並べ', '大富豪', 'ポーカー', 'ブラックジャック', 'ジジ抜き', 'ソリティア', 'クロンダイク', 'フリーセル', 'スパイダー', 'CPU'], en: ['solitaire', 'klondike', 'freecell', 'spider', 'jiji-nuki', 'playing cards', 'card games', 'old maid', 'concentration', 'memory', 'sevens', 'daifugo', 'president', 'poker', 'blackjack', 'cpu'] },
      icon: 'img/icons/cards.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#17614a"/><circle cx="36" cy="36" r="33" fill="#1d7358"/><g transform="rotate(-16 28 40)"><rect x="11" y="14" width="29" height="43" rx="4" fill="#243f86" stroke="#e7c36a" stroke-width="1.5"/><path d="M25.5 20l8 8-8 8-8-8zM25.5 36l8 8-8 8-8-8z" fill="none" stroke="#3a5cb0" stroke-width="1.3"/><circle cx="25.5" cy="35.5" r="3.2" fill="#e7c36a"/></g><g transform="rotate(11 44 36)"><rect x="28" y="10" width="32" height="46" rx="4" fill="#fffdf8" stroke="#c9b88a" stroke-width="1.2"/><text x="34" y="26" font-family="Georgia,serif" font-weight="700" font-size="14" fill="#1c2342">A</text><g transform="translate(35.5 26.5) scale(1.35)" fill="#1c2342"><path d="M12 1.8C9.4 5.6 3.6 8.4 3.6 13.4c0 2.7 2.1 4.6 4.5 4.6 1.5 0 2.7-.6 3.4-1.8-.1 2.7-.9 4.5-2.5 5.6h6c-1.6-1.1-2.4-2.9-2.5-5.6.7 1.2 1.9 1.8 3.4 1.8 2.4 0 4.5-1.9 4.5-4.6C20.4 8.4 14.6 5.6 12 1.8z"/></g></g></svg>', iconBg: '#17614a',
      thumb: 'img/thumbs/cards.webp', thumb2x: 'img/thumbs/cards@2x.webp',
      tech: '2d',
      // turn-based: hiding the page saves the unfinished game (kusoge.cards.game); no online battle in this version (CPU only)
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: false, stages: false },
      versus: null,
      // ★: 1 / 2 / 3 for a first place against Easy / Normal / Hard CPUs (practice games count nothing). The cap leaves room for years of play
      score: { unit: { ja: '★', en: '★' }, fmt: { ja: '★ {n}', en: '★ {n}' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.cards.save', paths: ['pts'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.cards.save', paths: ['pts'], agg: 'first', min: 1, num: true, tpl: { ja: '★ {n}', en: '★ {n}' } },
      keys: {
        'kusoge.cards.save': '{ v:1, pts（★の合計＝ランキング）, g:{ om|jj|cn|sv|dh|pk|bj:{ p（遊んだ回数）, w（1位の回数）, l（最下位の回数） }, k1|k3|fc|s1|s2|s4（ソリティア。クロンダイク1枚/3枚・フリーセル・スパイダー1/2/4スート）:{ p（動かした回数）, w（クリア回数）, bt（最短秒。小さいほど良い）, bm（最少手数）} }, stats:{ plays, wins, hard（つよいCPUに勝った回数）, cnStreak（神経衰弱で続けて取った最高の組数）, rev（革命）, cut8（8切り）, pkHands（ポーカーで勝ったハンド）, pkFlush（フラッシュ以上で勝った試合）, royal, pkPot, pkDouble, pkChips, bj（ブラックジャック）, bjWon, bjDbl, bjDouble, bjChips }, set:{ game, n（人数）, level, fast, o:{ <ゲームid>:{ …ゲームごとの設定 } } }, tut }',
        'kusoge.cards.game': 'とちゅうのゲーム（毎手自動保存）{ v:1, id, st（cards/engine.js の状態そのまま）, practice, opts, n, level, ms, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.cards.howto': '遊び方を見た（\'1\'）',
      },
      // counters only grow (max); the last settings are a whole value (newest)
      sync: {
        'kusoge.cards.save': { fields: { pts: 'max', g: { each: { fields: { bt: 'minPos', bm: 'minPos' }, rest: 'max' } }, stats: { each: 'max' }, set: 'newest', tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'fit', order: 20, path: 'fit/', added: '2026-11-24',
      title: { ja: 'ぴったりパズル工房', en: 'Fit Workshop' },
      short: { ja: 'ぴったり工房', en: 'Fit Workshop' },
      desc: { ja: '木と真鍮の工房で、決まった形の板（3〜5マスのピース）をぴったり敷きつめるタイムパズル。回して・裏返して・ドラッグで置こう。8つの世界に128ステージ、今日のパズル、3分間のタイムアタック、オンライン対戦も。ひっかけのピースにも注意。', en: 'A timed tile-fitting puzzle in a wood-and-brass workshop. Drag, rotate and flip pieces of 3 to 5 cells until they fill the board exactly. 128 stages in 8 worlds, a daily puzzle, a 3-minute time attack and online score battles. Watch out for decoy pieces.' },
      label: { ja: 'タイムパズル', en: 'Timed puzzle' },
      genres: ['puzzle'], tags: ['2d', 'stages', 'daily', 'endless', 'realtime', 'relax', 'versus'],
      keywords: { ja: ['パズル', 'ぴったり', 'ポリオミノ', 'ペントミノ', 'タイル', 'はめ込み', 'タイムアタック', '図形', '工房'], en: ['puzzle', 'tiling', 'polyomino', 'pentomino', 'tile', 'fit', 'time attack', 'shapes', 'workshop', 'tangram'] },
      icon: 'img/icons/fit.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#4a2f1a"/><rect x="5" y="5" width="62" height="62" rx="6" fill="#6a4426" stroke="#d9b45a" stroke-width="2"/><g stroke="#f4e4b8" stroke-width="1.2"><rect x="10" y="12" width="14" height="14" rx="2.5" fill="#3d9a8b"/><rect x="10" y="26" width="14" height="14" rx="2.5" fill="#3d9a8b"/><rect x="10" y="40" width="14" height="14" rx="2.5" fill="#3d9a8b"/><rect x="24" y="40" width="14" height="14" rx="2.5" fill="#3d9a8b"/><rect x="24" y="12" width="14" height="14" rx="2.5" fill="#e08a3c"/><rect x="38" y="12" width="14" height="14" rx="2.5" fill="#e08a3c"/><rect x="24" y="26" width="14" height="14" rx="2.5" fill="#e08a3c"/><rect x="38" y="26" width="14" height="14" rx="2.5" fill="#e08a3c"/></g><g transform="rotate(14 54 52)" stroke="#f4e4b8" stroke-width="1.2"><rect x="40" y="38" width="13" height="13" rx="2.5" fill="#d0527a"/><rect x="40" y="51" width="13" height="13" rx="2.5" fill="#d0527a"/><rect x="53" y="51" width="13" height="13" rx="2.5" fill="#d0527a"/></g><circle cx="12" cy="9" r="1.6" fill="#d9b45a"/><circle cx="60" cy="9" r="1.6" fill="#d9b45a"/></svg>',
      thumb: 'img/thumbs/fit.webp', thumb2x: 'img/thumbs/fit@2x.webp',
      tech: '2d',
      // pause: true — the clock runs while a puzzle is on screen and stops while hidden or paused. versus: common/versus.js, 3 minutes, the time-attack puzzles from the match seed (1000/puzzle + speed bonus)
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: true, stages: true },
      versus: 'common',
      // ranking = the best 3-minute time attack (puzzles solved). A time attack can't pass about 90 puzzles; the daily board's score is 600 minus the seconds
      score: { unit: { ja: '問', en: 'solved' }, fmt: { ja: '{n}問', en: '{n} solved' }, order: 'desc', cap: 1000, maxRate: null },
      rankSource: { key: 'kusoge.fit.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.fit.save', paths: ['stars'], agg: 'first', min: 1, num: true, tpl: { ja: '星 {n} / 384', en: '{n} / 384 stars' } },
      keys: {
        'kusoge.fit.save': '{ v:1, st:{ \'<世界>-<番号>\':{ s（最高の星 0〜3）, t（最短 ms）, c（クリア回数） } }（遊んだステージだけ）, best（タイムアタックで3分に解いた最高の数＝ランキング）, stars（s の合計）, stats:{ solved, perfect（星3）, noHint, fast（10秒以内・ヒントなし）, decoy（ひっかけつきを解いた）, daily, atRuns, worlds（全部クリアした世界の数）, flips }, daily:{ last（日付）, ms }, tut }',
        'kusoge.fit.run': 'とちゅうのパズル（自動保存）{ v:1, mode:\'stage\'|\'daily\'|\'attack\', id, dk, seed, k（タイムアタックの何問目）, solved, ms（かかった時間）, pen（ヒントなどの加算）, s（fit/engine.js の Session.snapshot）, tut, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.fit.howto': '遊び方を見た（\'1\'）',
      },
      // records only grow (max; fastest = minPos); the puzzle in progress is not synced
      sync: {
        'kusoge.fit.save': { fields: { st: { each: { fields: { s: 'max', t: 'minPos', c: 'max' } } }, best: 'max', stars: 'max', stats: { each: 'max' }, daily: { fields: { last: 'max', ms: 'minPos' }, rest: 'newest' }, tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'town', order: 21, path: 'town/', added: '2026-11-24',
      title: { ja: 'ひまつぶしタウン', en: 'Idle Town' },
      short: { ja: 'ひまつぶしタウン', en: 'Idle Town' },
      desc: { ja: 'ちいさな町を育てる放置ゲーム。すまい・はたけ・風車小屋・いちば・みなと・としょかん・見はり塔をならべて、となり合わせのボーナスをねらおう。るすの間も町ははたらき、おかえりなさいでコインがどっさり。人口がふえたら「町をひらきなおす」でずっと続くボーナス。', en: 'A cozy idle game about growing a little town. Place cottages, farms, windmills, markets, a harbor, a library and a lookout tower, and chase neighbour bonuses. The town keeps earning while you are away. Open a new town for a permanent bonus.' },
      label: { ja: '放置シミュレーション', en: 'Idle town builder' },
      genres: ['simulation'], tags: ['2d', 'idle', 'relax', 'upgrades', 'economy', 'casual'],
      keywords: { ja: ['放置', '街づくり', '町づくり', '育成', 'シミュレーション', 'クリッカー', 'インクリメンタル', '建物', '村', '農場', '経営'], en: ['idle', 'incremental', 'clicker', 'town builder', 'city builder', 'village', 'farm', 'tycoon', 'relaxing', 'cozy', 'offline progress'] },
      icon: 'img/icons/town.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#3b6fb0"/><circle cx="55" cy="16" r="7" fill="#ffe9a0"/><ellipse cx="22" cy="14" rx="10" ry="3.4" fill="#fff" opacity=".85"/><polygon points="36,26 66,42 36,58 6,42" fill="#7fc468" stroke="#3f8a40" stroke-width="1.5"/><polygon points="6,42 36,58 36,64 6,48" fill="#8a6038"/><polygon points="36,58 66,42 66,48 36,64" fill="#6e4a2a"/><g stroke="#5a3a20" stroke-width=".8"><polygon points="22,38 30,42 22,46 14,42" fill="#f6e4c1"/><polygon points="14,42 22,46 22,50 14,46" fill="#e3cba0"/><polygon points="22,46 30,42 30,46 22,50" fill="#cfb184"/><polygon points="22,30 32,38 22,42 12,38" fill="#d9644a"/><polygon points="44,36 52,40 44,44 36,40" fill="#f6e4c1"/><polygon points="44,44 52,40 52,44 44,48" fill="#cfb184"/><polygon points="44,28 54,36 44,40 34,36" fill="#3f9aa8"/></g><rect x="49" y="22" width="3" height="16" rx="1" fill="#f0e6d2" stroke="#5a3a20" stroke-width=".6"/><g stroke="#8a5a3a" stroke-width="1.6" stroke-linecap="round"><path d="M50.5 24 L43 17"/><path d="M50.5 24 L58 31"/><path d="M50.5 24 L58 17"/><path d="M50.5 24 L43 31"/></g></svg>',
      thumb: 'img/thumbs/town.webp', thumb2x: 'img/thumbs/town@2x.webp',
      tech: '2d',
      // pause: false — the town earns by the clock (also while the page is closed, up to the away cap), so nothing is stopped; hiding the page just saves. No online play
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: false, stages: false },
      versus: null,
      // ranking = the biggest population the town ever reached (it only grows). Moving the clock forward is the one way to cheat (see HANDOFF.md); the cap leaves room for years of play
      score: { unit: { ja: '人', en: 'residents' }, fmt: { ja: '{n}人', en: '{n} residents' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.town.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.town.save', paths: ['best'], agg: 'first', min: 1, num: true, tpl: { ja: '最高 {n}人', en: 'Best {n}' } },
      keys: {
        'kusoge.town.save': '{ v:1, best（町の人口の最高＝ランキング）, tier（町をひらきなおした回数）, renown（ほまれ＝ずっと続くもうけの倍率）, rs:{ <研究の id>: レベル }, qd:{ <目標の id>: 1 }（終えた目標）, un:{ <建物>: 1 }（使えるようになった建物）, stats:{ built, upgrades, taps（旅人にさわった数）, gifts, prestiges, research, returns（1時間以上のるす番から戻った回数）, awayMax（いちばん長いるす番の秒数）, kinds, expands, events }, daily:{ last（おくりものを受け取った日の通し日）, streak }, tut }。記録とほまれと研究だけ（同期する）',
        'kusoge.town.run': 'いまの町（自動保存）{ v:1, t（最後に進めた時刻 ms。時計を戻しても下がらない）, born, land（土地の一辺）, g（100マス：[建物, Lv, 払ったコイン, 払った木材] か 0）, res:{ coin, wood, food, spark }, pop, peak, ev, en, vn, vid, rn（乱数）, age, kinds, tier }。この端末だけ（同期しない）',
        'kusoge.town.howto': '遊び方を見た（\'1\'）',
      },
      // records, renown, research and finished goals only grow (max). The town itself stays on the device (the clock and the layout can not be merged)
      sync: {
        'kusoge.town.save': { fields: { best: 'max', tier: 'max', renown: 'max', rs: { each: 'max' }, qd: { each: 'max' }, un: { each: 'max' }, stats: { each: 'max' }, daily: { fields: { last: 'max', streak: 'max' }, rest: 'newest' }, tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'colorcards', order: 22, path: 'colorcards/', added: '2026-11-24',
      title: { ja: 'いろあわせカード工房', en: 'Color Match Cards' },
      short: { ja: 'いろあわせカード', en: 'Color Match' },
      desc: { ja: '糸の4色と数字を合わせて、手札を先に使い切るカードゲーム。0で向きが逆になり、とりかえ・のぞき見・からまり・ふた針・まもり糸・染め直しの特別札つき。「ラスト！」の言い忘れにも注意。CPUと2〜4人（強さは3段階）、10ラウンドマッチ、ふたりで1台もOK。友だちや知らない人とのオンライン対戦（部屋のコード・クイックマッチ、足りない席はCPU）もできます。', en: 'A shedding card game: match thread colors and numbers and empty your hand first. A 0 reverses the direction, and six workshop cards (Swap, Peek, Tangle, Double, Shield, Re-dye) shake things up. Do not forget to call "Last!". 2 to 4 players with three CPU strengths, a 10-round match and pass-and-play, plus online matches for 2 to 4 (room codes or quick match; empty seats are filled by CPUs).' },
      label: { ja: 'カードゲーム', en: 'Card game' },
      genres: ['board'], tags: ['2d', 'turn', 'cards', 'casual', 'versus', 'online'],
      keywords: { ja: ['カード', 'トランプ', '色合わせ', '数字合わせ', '手札', 'CPU', 'ふたりで', 'ラスト', 'オンライン対戦', '友だちと'], en: ['card game', 'shedding game', 'color matching', 'number matching', 'hand', 'cpu', 'pass and play', 'last card', 'online', 'multiplayer'] },
      icon: 'img/icons/colorcards.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#1d4c5c"/><g stroke="#fff" stroke-opacity=".12"><path d="M0 18h72M0 36h72M0 54h72M18 0v72M36 0v72M54 0v72"/></g><g transform="rotate(-18 24 40)"><rect x="9" y="14" width="27" height="40" rx="4" fill="#d6455d" stroke="#fffaf0" stroke-width="2.5"/><rect x="12.5" y="17.5" width="20" height="33" rx="2.5" fill="none" stroke="#fff" stroke-dasharray="3 2.4" stroke-opacity=".8"/><circle cx="22.5" cy="34" r="8" fill="#fff"/><text x="22.5" y="39.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="15" fill="#8f1f36">7</text></g><g transform="rotate(8 46 38)"><rect x="32" y="12" width="27" height="40" rx="4" fill="#2f6fd0" stroke="#fffaf0" stroke-width="2.5"/><rect x="35.5" y="15.5" width="20" height="33" rx="2.5" fill="none" stroke="#fff" stroke-dasharray="3 2.4" stroke-opacity=".8"/><circle cx="45.5" cy="32" r="8" fill="#fff"/><path d="M40 32c3-3 8-3 11 0M40 32c3 3 8 3 11 0" fill="none" stroke="#173d85" stroke-width="2"/><circle cx="45.5" cy="32" r="2.4" fill="#173d85"/></g><path d="M50 62c8 0 12-4 14-10" fill="none" stroke="#eab12c" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="60" r="5" fill="#2f9e5b" stroke="#fff" stroke-width="1.5"/></svg>',
      thumb: 'img/thumbs/colorcards.webp', thumb2x: 'img/thumbs/colorcards@2x.webp',
      tech: '2d',
      // turn-based: hiding the page saves the unfinished game (kusoge.colorcards.game); online matches (2-4 players, host-authoritative) run on RTDB tr/colorcards/* through common/turnroom.js (database.rules.json). Online results do not feed the ranking
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: false, stages: false },
      versus: 'own',
      // ★: 1 / 2 / 3 for a win against Easy / Normal / Hard CPUs, triple for a 10-round match (practice, tutorial and pass-and-play count nothing). The cap leaves room for years of play
      score: { unit: { ja: '★', en: '★' }, fmt: { ja: '★ {n}', en: '★ {n}' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.colorcards.save', paths: ['pts'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.colorcards.save', paths: ['pts'], agg: 'first', min: 1, num: true, tpl: { ja: '★ {n}', en: '★ {n}' } },
      keys: {
        'kusoge.colorcards.save': '{ v:1, pts（★の合計＝ランキング）, w:{ q|m（1ゲーム・10ラウンド）:{ p（遊んだ回数）, w（勝った回数） } }, stats:{ plays, wins, hard（つよいCPUに勝った回数）, swap, peek, tangle, block（まもり糸ではね返した）, dye, zero（0で向きを変えた）, calls（ラスト！の宣言）, catches（つかまえた！）, dblOut（ふた針のあとにあがった）, comeback（12枚以上持って勝った）, noDraw（一度もひかずに勝った）, matches, matchWins, onl（オンラインで遊んだ回数）, onw（オンラインで1位になった回数。★・ランキングには入らない） }, set:{ n, level, mode（quick|match）, fast }, tut }',
        'kusoge.colorcards.game': 'とちゅうのゲーム（毎手自動保存）{ v:1, st（colorcards/engine.js の状態そのまま）, mode, practice, ms, coached, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.colorcards.howto': 'ルールを見た（\'1\'）',
      },
      // counters only grow (max); the last settings are a whole value (newest)
      sync: {
        'kusoge.colorcards.save': { fields: { pts: 'max', w: { each: { each: 'max' } }, stats: { each: 'max' }, set: 'newest', tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'brawl', order: 23, path: 'brawl/', added: '2026-11-24',
      title: { ja: 'おもちゃ大乱闘', en: 'Toy Brawl' },
      short: { ja: 'おもちゃ大乱闘', en: 'Toy Brawl' },
      desc: { ja: '工房のおもちゃたちが、ステージの外へふっとばし合う大乱闘。ダメージがたまるほど遠くへ飛ぶ。ぜんまいロボ・アヒル騎士・折り紙ニンジャ・魔法使いパペット・戦車・キリン・カニ・ペンギン太鼓など18人のおもちゃ、5つのステージ。はじき・ダッシュ・ジャストガード・うけ身・ふち技まで、本格的な対戦アクションの操作（キーボード・ゲームパッド・タッチ、キーは変更できる）。CPU（3段階）と1〜3人で、ふたりで1台で、8戦のラダーで、れんしゅうで。友だちや知らない人とのオンライン1対1（部屋のコード・クイックマッチ）もできます。オンラインの結果はランキングや点には入りません。', en: 'A brawl where workshop toys knock each other off the stage. The more damage a toy has taken, the farther it flies. Eighteen toys (a wind-up robot, a duck knight, a paper ninja, a puppet wizard, a tank, a block giraffe, a crab, a drum penguin and more) on five stages, with full platform-fighter controls: flicks, dashes, perfect shields, teching and ledge options (keyboard, gamepad and touch; the keys can be remapped). Fight 1-3 CPUs (three levels), play two on one device, climb the 8-fight ladder or train. Online 1v1 (room code or quick match, rollback netcode) is built in; online results do not affect rankings or points.' },
      label: { ja: '対戦アクション', en: 'Platform fighter' },
      genres: ['action'], tags: ['2d', 'realtime', 'versus', 'stages', 'casual'],
      keywords: { ja: ['格闘', '対戦', 'アクション', 'ふっとばし', '乱闘', 'おもちゃ', 'CPU', 'ふたりで', 'ラダー', 'オンライン', '場外', 'はじき', 'ガード', '18人'], en: ['fighting', 'brawl', 'platform fighter', 'action', 'knockback', 'toys', 'cpu', 'two player', 'ladder', 'online', 'multiplayer', 'versus', 'flick', 'shield', 'roster'] },
      icon: 'img/icons/brawl.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#3b3175"/><path d="M0 56h72v16H0z" fill="#8a5a2b"/><path d="M0 56h72v5H0z" fill="#e2b673"/><rect x="8" y="34" width="18" height="20" rx="3" fill="#e0613a" stroke="#2a1d17" stroke-width="2.4"/><rect x="10" y="22" width="14" height="12" rx="3" fill="#f08a63" stroke="#2a1d17" stroke-width="2.4"/><circle cx="14.5" cy="28" r="2.6" fill="#fff"/><circle cx="20.5" cy="28" r="2.6" fill="#fff"/><path d="M17 22v-5" stroke="#2a1d17" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="15.5" r="2.4" fill="#f3b441" stroke="#2a1d17" stroke-width="1.6"/><path d="M25 41l12-2" stroke="#2a1d17" stroke-width="9" stroke-linecap="round"/><path d="M25 41l12-2" stroke="#b9bdc6" stroke-width="5" stroke-linecap="round"/><circle cx="39" cy="38.5" r="5.6" fill="#d2d5dc" stroke="#2a1d17" stroke-width="2.4"/><path d="M47 30l3 4 5-1-2 4 4 3-5 1-1 5-3-4-5 1 2-4-4-3 5-1z" fill="#ffd23f" stroke="#2a1d17" stroke-width="1.8" stroke-linejoin="round"/><g transform="rotate(-28 56 24)"><ellipse cx="56" cy="26" rx="9" ry="10" fill="#f2d13c" stroke="#2a1d17" stroke-width="2.4"/><path d="M60 14l9 2-8 5z" fill="#f09a2d" stroke="#2a1d17" stroke-width="2" stroke-linejoin="round"/><circle cx="59" cy="12" r="5" fill="#f2d13c" stroke="#2a1d17" stroke-width="2.4"/><path d="M53 10a6 6 0 0 1 11 0z" fill="#8da0c9" stroke="#2a1d17" stroke-width="2"/></g></svg>',
      thumb: 'img/thumbs/brawl.webp', thumb2x: 'img/thumbs/brawl@2x.webp',
      tech: '2d',
      // real time (60 Hz): hiding the page pauses the match and waits for "Resume"; online 1v1 (room code / quick match, rollback netcode) runs on RTDB bw/* through brawl/netcode.js + brawl/online.js (database.rules.json); its results never feed the ranking or points (the stats op/ow are counters only). Offline: CPU, two players on one device, ladder, training
      flags: { ranking: true, achievements: true, daily: false, versus: true, pause: true, stages: false },
      versus: 'own',
      // the best score of one ladder run (8 fights: win bonus + stocks left + KOs + speed, times the level; a continue costs 1000). A full run is about 12000-25000, so the cap leaves room
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n}点', en: '{n} pts' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.brawl.save', paths: ['best'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.brawl.save', paths: ['best'], agg: 'first', min: 1, num: true, tpl: { ja: 'ベスト {n} 点', en: 'Best {n} pts' } },
      keys: {
        'kusoge.brawl.save': '{ v:1, best（ラダー1周のベスト得点＝ランキング）, lw（ラダーで勝った試合の数）, cl（ラダーをクリアした回数）, un:{ c:{ <おもちゃ>:1 }（開いたおもちゃ。18人のうち、はじめは3人。ラダーで3人、あとは2勝ごとに1人、ラダー制覇で全員）, s:{ <ステージ>:1 }（開いたステージ） }, cp:{ <おもちゃ>:使った回数 }, stats:{ plays, wins, kos（ふっとばした数）, falls, maxCmb（最大コンボ）, perfect（残機を失わずに勝った）, hard（つよいCPUに勝った）, ffa（4人乱闘で勝った）, twop（ふたりで遊んだ）, smashKo（つよい攻撃でふっとばした）, spike, counter, ledge, grab, block, timed, boss, lad, train, pshield（ジャストガード）, tech（うけ身）, flick（はじき強攻撃）}, set:{ 最後に選んだ設定 }, ctl:{ tj（はじきジャンプ 1/0）, run（キーボードのはしり \'hold\'|\'tap\'）, keys:{ p1:{ <操作>:<KeyboardEvent.code> }, p2:{…} }（変えたキーだけ。操作は L R U D J A S H G M T CL CR CU CD） }, tut }（stats には op＝オンラインの試合数・ow＝オンラインで勝った数も入る。ランキングや点には入らない）',
        'kusoge.brawl.run': 'とちゅうのラダー（試合のあいだに自動保存）{ v:1, ch, diff（1〜3）, idx（次の試合 0〜7）, score, cont（のこりのコンティニュー）, seed, kos }。この端末だけ（同期しない）。終わると消す',
        'kusoge.brawl.olroom': 'オンラインの部屋をつくったまま閉じたときの目印 { rid（部屋の id）, host: 1, code（6けたのコード。なければ空）}、なければ \'null\'。次に開いたときに部屋をかたづける。この端末だけ（同期しない）',
        'kusoge.brawl.howto': '遊び方を見た（\'1\'）',
      },
      // counters and unlocks only grow (max); the last setup is a whole value (newest)
      sync: {
        'kusoge.brawl.save': { fields: { best: 'max', lw: 'max', cl: 'max', un: { each: { each: 'max' } }, cp: { each: 'max' }, stats: { each: 'max' }, set: 'newest', ctl: 'newest', tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'train', order: 24, path: 'train/', added: '2026-11-24',
      title: { ja: 'でんしゃでいこう', en: 'All Aboard!' },
      short: { ja: 'でんしゃでいこう', en: 'All Aboard!' },
      desc: { ja: 'ひなた線の運転士になって、時間どおりに、ぴたりと駅に止める運転ゲーム。ノッチで加速とブレーキ、制限速度と信号を守って、お客さんにやさしく。ぜんぶ架空の3つの路線・9つのルート、雨や雪や夜の運転も。', en: 'Drive a train on the fictional Hinata lines: work the notch lever, obey speed limits and signals, arrive on time and stop right on the marker without jolting the passengers. Nine routes on three made-up lines, with rain, snow, fog and night runs.' },
      label: { ja: '運転シミュレーション', en: 'Driving sim' },
      genres: ['simulation'], tags: ['2d', 'realtime', 'stages', 'casual'],
      keywords: { ja: ['電車', '運転', '運転士', '鉄道', 'ノッチ', 'ブレーキ', '停車', '信号', '時刻表', 'シミュレーター'], en: ['train', 'driving', 'driver', 'railway', 'simulator', 'brake', 'stop', 'signal', 'timetable', 'conductor'] },
      icon: 'img/icons/train.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#7ec8f0"/><path d="M0 40h72v32H0z" fill="#5fae4b"/><path d="M0 40q18-12 36-4t36-3v7H0z" fill="#8fcf7a"/><path d="M30 40L10 72h14l8-26zM42 40l20 32H48l-8-26z" fill="#9a948a"/><path d="M33 40L24 72M39 40l9 32" stroke="#e8edf0" stroke-width="2.4"/><path d="M26 66h20M28 58h16M30 52h12M31.5 47h9" stroke="#5b4a3c" stroke-width="2"/><path d="M60 8v38" stroke="#6b737b" stroke-width="2.4"/><rect x="55" y="8" width="10" height="20" rx="3" fill="#20252b"/><circle cx="60" cy="13" r="2.6" fill="#3a1512"/><circle cx="60" cy="18.5" r="2.6" fill="#ffc928"/><circle cx="60" cy="24" r="2.6" fill="#3ddc6a"/><circle cx="14" cy="14" r="7" fill="#fff6c0"/></svg>',
      thumb: 'img/thumbs/train.webp', thumb2x: 'img/thumbs/train@2x.webp',
      tech: '2d',
      // real time (60 Hz): hiding the page pauses the run and waits for "Resume"; no online battle
      flags: { ranking: true, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      // the sum of the best score of every route (9 routes, up to 1000 per leg; all nine perfect is about 26000), so the cap leaves room
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n}点', en: '{n} pts' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.train.save', paths: ['total'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.train.save', paths: ['total'], agg: 'first', min: 1, num: true, tpl: { ja: '合計 {n} 点', en: 'Total {n} pts' } },
      keys: {
        'kusoge.train.save': '{ v:1, total（9ルートのベスト得点の合計＝ランキング）, stars（★の合計）, r:{ <ルート r1〜r9>:{ b（ベスト得点）, s（★ 0〜3）, p（遊んだ回数）} }, un:{ l2, l3（開いた路線）}, stats:{ plays, clears, legs, stops, pita（0.6m以内で止めた）, ontime（ダイヤ±2秒）, smooth（乗りごこち95%以上）, gold（1区間950点以上）, three（★3の数）, night（夜のルートのクリア）, waits（赤信号で待った）, ats, red }, set:{ route（最後に選んだルート）}, tut }',
        'kusoge.train.howto': '遊び方を見た（\'1\'）',
      },
      // counters, best scores and unlocks only grow (max); the last route is a whole value (newest)
      sync: {
        'kusoge.train.save': { fields: { total: 'max', stars: 'max', r: { each: { each: 'max' } }, un: { each: 'max' }, stats: { each: 'max' }, set: 'newest', tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'reversi', order: 25, path: 'reversi/', added: '2026-11-25',
      title: { ja: 'リバーシ工房', en: 'Reversi Workshop' },
      short: { ja: 'リバーシ', en: 'Reversi' },
      desc: { ja: '黒と白の石をはさんでひっくり返す、定番のボードゲーム。8×8と6×6の盤で、CPUと対戦（4段階。いちばん強いCPUは6手先まで読み、終盤は最後まで読み切ります）。ヒントともどす、ふたりで1台、やさしい順に5問の「今日のパズル」、友だちとのオンライン対戦（部屋のコード・クイックマッチ）もできます。', en: 'The classic disc game: close in the other color and flip it. Play the CPU on 8×8 or 6×6 at four levels (the strongest looks six moves ahead and reads the endgame to the last stone), use hints and undo, play two on one device, solve the five-position daily puzzle (easiest first), or play friends online with a room code or quick match.' },
      label: { ja: 'ボードゲーム', en: 'Board game' },
      genres: ['board'], tags: ['2d', 'turn', 'board', 'casual', 'daily', 'versus', 'online'],
      keywords: { ja: ['リバーシ', '白黒', '石', 'ひっくり返す', 'ボード', 'CPU', 'ふたりで', 'パズル', 'オンライン対戦', '友だちと', '8×8', '6×6'], en: ['reversi', 'flip', 'discs', 'board game', 'two player', 'cpu', 'daily puzzle', 'endgame', 'online', 'multiplayer', '8x8', '6x6'] },
      icon: 'img/icons/reversi.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#1c5a4e"/><g stroke="#0b2d27" stroke-width="1.6" stroke-opacity=".7"><path d="M6 24h60M6 40h60M6 56h60M24 8v56M40 8v56M56 8v56"/></g><circle cx="24" cy="24" r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle cx="24" cy="24" r="3.6" fill="#f0c968"/><circle cx="40" cy="24" r="10" fill="#f1e8d6" stroke="#7c8aa8" stroke-width="1.6"/><path d="M35 24h10" stroke="#5f6e8e" stroke-width="3" stroke-linecap="round" transform="rotate(35 40 24)"/><circle cx="40" cy="40" r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle cx="40" cy="40" r="3.6" fill="#f0c968"/><g transform="translate(24 40) scale(.62 1)"><circle r="10" fill="#f1e8d6" stroke="#7c8aa8" stroke-width="1.6"/></g><g transform="translate(56 40)"><circle r="10" fill="#27305b" stroke="#f0c968" stroke-width="1.6" stroke-dasharray="2.4 2.6"/><circle r="3.6" fill="#f0c968"/></g></svg>',
      thumb: 'img/thumbs/reversi.webp', thumb2x: 'img/thumbs/reversi@2x.webp',
      tech: '2d',
      // turn-based: hiding the page saves the unfinished game (kusoge.reversi.game); online matches (2 players, host-authoritative) run on RTDB tr/reversi/* through common/turnroom.js (database.rules.json). Online results do not feed the ranking
      flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: false },
      versus: 'own',
      // ★: a win on 8x8 against the CPU, 1 / 2 / 3 / 4 for Easy / Normal / Hard / Expert, with no hint and no undo (6x6, two players on one device, the daily puzzle and online count nothing). The cap leaves room for years of play
      score: { unit: { ja: '★', en: '★' }, fmt: { ja: '★ {n}', en: '★ {n}' }, order: 'desc', cap: 100000, maxRate: null },
      rankSource: { key: 'kusoge.reversi.save', paths: ['pts'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.reversi.save', paths: ['pts'], agg: 'first', min: 1, num: true, tpl: { ja: '★ {n}', en: '★ {n}' } },
      keys: {
        'kusoge.reversi.save': '{ v:1, pts（★の合計＝ランキング）, w:{ "<盤 6|8>-<強さ 1〜4>":{ p（遊んだ回数）, w（勝った回数） } }, stats:{ plays, wins, lv3（つよいCPUに勝った）, hard（とてもつよいCPUに勝った）, six（6×6で勝った）, big（30個以上の差で勝った）, wipe（相手の石を全部ひっくり返して勝った）, corner4（四隅をぜんぶとって勝った）, corners（角に置いた数）, pass（CPUをパスにした数）, twop（ふたりで1台で遊んだ）, pz（今日のパズルの正解数）, dperf（5問ぜんぶ正解した日）, dplay（今日のパズルを最後まで解いた日）, onl（オンラインで遊んだ回数）, onw（オンラインで勝った回数。★・ランキングには入らない） }, set:{ level, me（b|w|r）, n（6|8）, start（std|par）, fast, dots }, dl:{ last（日付 YYYYMMDD）, pts, r:[[選んだマス, 正解 0|1, 点]…] }, tut }',
        'kusoge.reversi.game': 'とちゅうのゲーム（1手ごとに自動保存）{ v:1, mode（cpu|pass）, n, start, level, me, seed, moves:[[マス,色]…]（マス -1 はパス）, hinted, undone, corners, passed, ms, cfg, at }。この端末だけ（同期しない）。終わると消す',
        'kusoge.reversi.howto': 'ルールを見た（\'1\'）',
      },
      // counters only grow (max); the last settings and today's puzzle answers are whole values (newest)
      sync: {
        'kusoge.reversi.save': { fields: { pts: 'max', w: { each: { each: 'max' } }, stats: { each: 'max' }, set: 'newest', dl: 'newest', tut: 'max' }, rest: 'newest' },
      },
    },
    {
      id: 'manabi', order: 26, path: 'manabi/', added: '2026-11-25',
      title: { ja: 'まなびの工房', en: 'Study Workshop' },
      short: { ja: 'まなびの工房', en: 'Study Workshop' },
      desc: { ja: '英語・数学・国語・古文・理科・社会・情報を、ゲームのように少しずつ。中学と高校の問題を1レッスン8問。まちがえた問題は何度でも戻ってくる。', en: 'Study English, math, Japanese, classical Japanese, science, social studies and information in short lessons. Missed questions keep coming back.' },
      label: { ja: '学習', en: 'Study' },
      genres: ['study'], tags: ['2d', 'casual', 'stages'],
      keywords: { ja: ['勉強', '学習', '英語', '数学', '国語', '古文', '理科', '社会', '情報', '中学', '高校', '復習', 'テスト'], en: ['study', 'learning', 'english', 'math', 'japanese', 'classical japanese', 'science', 'social studies', 'information', 'junior high', 'high school', 'review', 'test', 'quiz'] },
      icon: 'img/icons/manabi.svg', iconSvg: '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2f86d6"/><circle cx="58" cy="12" r="9" fill="#5ab0f0" opacity=".7"/><path d="M8 52q14-7 28 0 14-7 28 0v10q-14-7-28 0-14-7-28 0z" fill="#fff6e0" stroke="#d8a93a" stroke-width="1.6" stroke-linejoin="round"/><path d="M36 52v10" stroke="#d8a93a" stroke-width="1.6"/><circle cx="36" cy="33" r="20" fill="#ffc233" stroke="#c98a12" stroke-width="2.4"/><path d="M23 19L49 13" stroke="#c98a12" stroke-width="4" stroke-linecap="round"/><path d="M24 21q12-5 24-3" stroke="#fff" stroke-opacity=".55" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="29" cy="33" rx="3.4" ry="4.2" fill="#fff"/><ellipse cx="43" cy="33" rx="3.4" ry="4.2" fill="#fff"/><circle cx="29.6" cy="34.2" r="2.1" fill="#2b2118"/><circle cx="43.6" cy="34.2" r="2.1" fill="#2b2118"/><circle cx="23.5" cy="41" r="3.2" fill="#ff7a9a" opacity=".55"/><circle cx="48.5" cy="41" r="3.2" fill="#ff7a9a" opacity=".55"/><path d="M31 42q5 5.5 10 0" stroke="#2b2118" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M60 26l1.8 3.8 3.8 1.8-3.8 1.8L60 37l-1.8-3.8-3.8-1.8 3.8-1.8z" fill="#ffe14d"/></svg>', iconBg: '#2f86d6',
      thumb: 'img/thumbs/manabi.webp', thumb2x: 'img/thumbs/manabi@2x.webp',
      tech: '2d',
      // lesson-based (8 questions each): no real-time clock, so no pause. No ranking and no versus: it is a study tool, not a contest.
      // score is the total XP (only the registry needs a unit and a cap; ranking is off and nothing reads rankSource)
      flags: { ranking: false, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      score: { unit: { ja: 'XP', en: 'XP' }, fmt: { ja: '{n} XP', en: '{n} XP' }, order: 'desc', cap: 10000000, maxRate: null },
      rankSource: { key: 'kusoge.manabi.save', paths: ['xp'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.manabi.save', paths: ['xp'], agg: 'first', min: 1, num: true, tpl: { ja: '{n} XP', en: '{n} XP' } },
      keys: {
        'kusoge.manabi.save': '{ v:1, xp（XPの合計）, d:[日番号…（勉強した日。直近120日）], g:{ 日番号: その日のXP（直近14日）}, goal（今日の目標XP 10|20|30|50）, b:{ <単元セットの id>: "<ハッシュ>:<箱の文字列>"（復習の箱 0〜5と最後にやった日。1問3文字） }, st:{ q（答えた数）, ok（正解）, ls（レッスン数）, mk（模試の数）, best（連続日数の最高）}, mk:{ <模試の id>: 最高の正答率% }, set:{ cr（JH|HS）, sub, g（最後に見ていた学年・科目）}, tut, gm（ジェム）, fz（ストリーク・フリーズ 0〜2）, hm（ハートモード 1/0）, hr（ハート 0〜5）, cw:{ <特別コースの id>: 王冠 0〜5 }, ds:{ d（日番号）, xp, ls, ok, perfect, rev, sp（今日のクエストの数え）}, dq:{ d, c:[3つのクエストの受け取りずみ 1/0] }, lg:{ w（週番号）, t（リーグ 0〜5）}, sk（ねじまるの色 0〜5）, mm:[[単元セットの id, 問題の id]…]（模試でまちがえた問題。最大60。「模試のまちがい」のレッスンで正解すると消える） }。同期する',
        'kusoge.manabi.howto': '遊び方を見た（\'1\'）',
        'kusoge.manabi.run': 'とちゅうのレッスン（1問ごとに自動保存）{ d, log, xp, t, ft, miss }。この端末だけ（同期しない）。終わると消す',
        'kusoge.manabi.rep': '「まちがいを報告」をした問題 { <問題の id>: 日番号 }。この端末だけ（同期しない）',
        'kusoge.manabi.prefs': '効果音・しんどう・アニメーション・読み上げ・出題のバラエティ { snd, hap, anim, say, variety }。この端末だけ（同期しない）',
      },
      // counters only grow (max); per-day maps and the day-bound quest state follow the newest device; the review boxes and settings are whole values (newest)
      sync: {
        'kusoge.manabi.save': { fields: { xp: 'max', d: 'union', g: { each: 'max' }, goal: 'newest', b: { each: 'newest' }, st: { each: 'max' }, mk: { each: 'max' }, set: 'newest', tut: 'max', gm: 'newest', fz: 'newest', hm: 'newest', hr: 'newest', cw: { each: 'max' }, mm: 'union', dl: { each: 'max' }, dm: 'union', ch: { each: 'max' }, jp: { each: 'max' }, iv: 'newest', bx: 'max', fd: 'union', ow: 'union', bd: 'union', fq: 'max', fc: 'newest', tc: 'union', wg: 'newest', ds: 'newest', dq: 'newest', lg: 'newest', sk: 'newest' }, rest: 'newest' },
      },
    },
    {
      id: 'orchestra', order: 27, path: 'orchestra/', added: '2026-11-25',
      title: { ja: '指揮者ゲーム', en: 'Conductor' },
      short: { ja: '指揮者ゲーム', en: 'Conductor' },
      desc: { ja: 'バトンを振って、本物の楽器を録音した音のオーケストラを指揮しよう。拍でテンポが決まり、振りの大きさで強弱がつく。光った楽器に入りのキューを出して、ベートーヴェン、モーツァルト、ドヴォルザークなど8曲を最後まで。', en: 'Wave the baton and conduct an orchestra made of real recorded instruments. Your beats set the tempo, the size of your stroke sets the volume, and you cue each glowing section in. Eight pieces from Beethoven, Mozart, Dvorak and more.' },
      label: { ja: '音楽・指揮', en: 'Music' },
      genres: ['music'], tags: ['2d', 'realtime', 'stages', 'casual'],
      keywords: { ja: ['指揮', '指揮者', 'オーケストラ', '音楽', 'クラシック', 'バトン', 'タクト', 'ベートーヴェン', 'モーツァルト'], en: ['conductor', 'orchestra', 'music', 'classical', 'baton', 'beethoven', 'mozart', 'symphony'] },
      icon: 'img/icons/orchestra.svg', iconSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#5b1d2b"/><ellipse cx="36" cy="78" rx="52" ry="40" fill="#8a3a45"/><ellipse cx="36" cy="78" rx="34" ry="24" fill="#a8494e"/><g fill="#f2c15e"><circle cx="14" cy="38" r="4.2"/><circle cx="26" cy="31" r="4.2"/><circle cx="46" cy="31" r="4.2"/><circle cx="58" cy="38" r="4.2"/><circle cx="20" cy="24" r="3.4"/><circle cx="36" cy="21" r="3.4"/><circle cx="52" cy="24" r="3.4"/></g><rect x="26" y="54" width="20" height="8" rx="3" fill="#2b0f16"/><circle cx="36" cy="49" r="4.4" fill="#2b0f16"/><path d="M36 45L52 14" stroke="#fff4dc" stroke-width="2.6" stroke-linecap="round"/><circle cx="52" cy="14" r="3.2" fill="#ffd36a"/><path d="M45 11c3-5 9-5 11 0M42 16c2-8 14-9 17 0" fill="none" stroke="#ffd36a" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg>',
      thumb: 'img/thumbs/orchestra.webp', thumb2x: 'img/thumbs/orchestra@2x.webp',
      tech: '2d',
      // real time: hiding the page pauses the piece and waits for "Resume"; no online play. No ranking (a personal toy): stars and best scores stay on the device and sync across it; score is only the sum of the 8 best scores, for the registry
      flags: { ranking: false, achievements: true, daily: false, versus: false, pause: true, stages: true },
      versus: null,
      // total = sum over the 8 pieces of the best score (0-100, best of the three difficulties); ranking is off and nothing reads rankSource
      score: { unit: { ja: '点', en: 'pts' }, fmt: { ja: '{n}点', en: '{n} pts' }, order: 'desc', cap: 3000, maxRate: null },
      rankSource: { key: 'kusoge.orchestra.save', paths: ['total'], agg: 'first', offset: 0 },
      record: { key: 'kusoge.orchestra.save', paths: ['stars'], agg: 'first', min: 1, num: true, tpl: { ja: '★ {n}', en: '★ {n}' } },
      keys: {
        'kusoge.orchestra.save': '{ v:1, total（曲ごとのベスト得点の合計）, stars（曲ごとの最高の★の合計）, p:{ <曲ID（beethoven5, nachtmusik, dvorak7-1, dvorak9-4, dvorak8-1 など。長い楽章は <ID>~a / <ID>~b の前半・後半も）>:{ b0,s0（たのしむのベスト点と★）, b1,s1（ふつう）, b2,s2（マエストロ）, n（遊んだ回数）} }, stats:{ plays, finishes, cues（出した入りの数）, perfect（ばっちりの入り）, beats（振った拍）, three（★3の数）}, set:{ diff（最後のむずかしさ）, piece }, tut }',
        'kusoge.orchestra.prefs': '音質・動きセンサー・振りの感度・振り方ガイド { quality: auto|hi|lo, motion, sens, guide }。この端末だけ（同期しない）',
        'kusoge.orchestra.howto': '遊び方を見た（\'1\'）',
      },
      // counters, best scores and stars only grow (max); the last difficulty and piece are whole values (newest)
      sync: {
        'kusoge.orchestra.save': { fields: { total: 'max', stars: 'max', p: { each: { each: 'max' } }, stats: { each: 'max' }, set: 'newest', tut: 'max' }, rest: 'newest' },
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
      { id: 'planet.combo1', tier: 1, icon: 'star', title: { ja: 'はじめてのコンボ', en: 'First Combo' }, desc: { ja: '道具の組み合わせでコンボを起こす', en: 'Set off a combo by combining tools' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.combos' }, gte: 1 } },
      { id: 'planet.combo5', tier: 3, icon: 'trophy', title: { ja: 'コンボ博士', en: 'Combo Scholar' }, desc: { ja: '5つのコンボをすべて見つける', en: 'Discover all 5 combos' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.combos' }, gte: 5 } },
      { id: 'planet.ending', tier: 3, icon: 'globe', title: { ja: '星の物語', en: 'A Planet\'s Story' }, desc: { ja: '自分の星を宇宙時代まで育てる', en: 'Grow your own planet to the space age' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.ends' }, gte: 1 } },
      { id: 'planet.pts5k', tier: 2, icon: 'star', title: { ja: '五千点の宇宙', en: '5,000-Point Cosmos' }, desc: { ja: 'シナリオ合計5,000点', en: 'Reach a scenario total of 5,000' }, when: { rec: { key: 'kusoge.planet.save', path: 'total' }, gte: 5000 } },
      { id: 'planet.dex10', tier: 2, icon: 'star', title: { ja: '星の博物学者', en: 'Planet Naturalist' }, desc: { ja: '図鑑に10種類を登録する', en: 'Log 10 discoveries' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.dex' }, gte: 10 } },
      { id: 'planet.walk', tier: 1, icon: 'globe', title: { ja: 'ぐるっと一周', en: 'All the Way Round' }, desc: { ja: '自分の足で星を一周する', en: 'Walk all the way round a planet' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.walk' }, gte: 1 } },
      { id: 'planet.wonder5', tier: 2, icon: 'globe', title: { ja: 'ふしぎな星めぐり', en: 'Wonder Tour' }, desc: { ja: '5つのふしぎな星をすべてたずねる', en: 'Visit all 5 wonder planets' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.wonders' }, gte: 5 } },
      { id: 'planet.learn7', tier: 3, icon: 'trophy', title: { ja: '星の先生', en: 'Planet Teacher' }, desc: { ja: 'まなぶモードの7章をすべて終える', en: 'Finish all 7 chapters of Learn mode' }, when: { rec: { key: 'kusoge.planet.save', path: 'stats.learn' }, gte: 7 } },
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
      { id: 'escape.r6', tier: 3, icon: 'trophy', title: { ja: '蔵の主', en: 'Master of the Cellar' }, desc: { ja: 'おまけの部屋「親方の蔵」から脱出', en: "Escape the bonus room, the Master's Cellar" }, when: { rec: { key: 'kusoge.escape.save', path: 'rooms.r6.c' }, gte: 1 } },
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
      { id: 'physics.make1', tier: 2, icon: 'check', title: { ja: '工房デビュー', en: 'Workshop Debut' }, desc: { ja: '「つくる」で作ったレベルを、自分でクリアして確かめる', en: 'Make a level with "Create" and clear it yourself' }, when: { rec: { key: 'kusoge.physics.save', path: 'stats.made' }, gte: 1 } },
      { id: 'physics.share1', tier: 2, icon: 'globe', title: { ja: 'おすそわけ', en: 'Sharing Is Caring' }, desc: { ja: 'クリアを確かめたレベルを、コードかURLで共有する', en: 'Share a verified level with a code or URL' }, when: { rec: { key: 'kusoge.physics.save', path: 'stats.shared' }, gte: 1 } },
    ],
    minigolf: [
      { id: 'minigolf.h1', tier: 1, icon: 'check', title: { ja: 'カップイン', en: 'In the Cup' }, desc: { ja: 'はじめてカップに入れる', en: 'Sink your first putt' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.holes' }, gte: 1 } },
      { id: 'minigolf.r1', tier: 1, icon: 'check', title: { ja: '作業台を一周', en: 'Round the Bench' }, desc: { ja: '「定規の作業台」を9ホール回る', en: 'Finish a round on Ruler Bench' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'c.c1.r' }, gte: 1 } },
      { id: 'minigolf.all', tier: 3, icon: 'trophy', title: { ja: '工房のゴルファー', en: 'Workshop Golfer' }, desc: { ja: '「見習い」の3つのコースをすべて回る', en: 'Finish a round on all 3 Apprentice courses' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 3 }, grantsTitle: { ja: '工房のゴルファー', en: 'Workshop Golfer' } },
      { id: 'minigolf.t2', tier: 3, icon: 'trophy', title: { ja: '一人前の職人', en: 'Journeyman' }, desc: { ja: '「職人」の段のコースをすべて回る（7コース）', en: 'Finish every Journeyman course (7 courses in all)' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 7 } },
      { id: 'minigolf.t3', tier: 3, icon: 'trophy', title: { ja: '熟練の手', en: 'Skilled Hands' }, desc: { ja: '「熟練」の段のコースをすべて回る（12コース）', en: 'Finish every Craftsman course (12 courses in all)' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 12 } },
      { id: 'minigolf.t4', tier: 4, icon: 'trophy', title: { ja: '名工', en: 'Master Craftsman' }, desc: { ja: '「名工」の段のコースをすべて回る（17コース）', en: 'Finish every Master course (17 courses in all)' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 17 } },
      { id: 'minigolf.t5', tier: 4, icon: 'trophy', title: { ja: 'ゴルフ工房の親方', en: 'Grandmaster of the Links' }, desc: { ja: '22のコースをすべて回る', en: 'Finish a round on all 22 courses' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'done' }, gte: 22 }, grantsTitle: { ja: 'ゴルフ工房の親方', en: 'Grandmaster of the Links' } },
      { id: 'minigolf.stars100', tier: 2, icon: 'star', title: { ja: '星あつめ', en: 'Star Collector' }, desc: { ja: '星を合わせて100個', en: 'Collect 100 stars' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stars' }, gte: 100 } },
      { id: 'minigolf.stars400', tier: 4, icon: 'star', title: { ja: '星の工房', en: 'Workshop of Stars' }, desc: { ja: '星を合わせて400個', en: 'Collect 400 stars' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stars' }, gte: 400 } },
      { id: 'minigolf.ace', tier: 2, icon: 'star', title: { ja: 'ホールインワン', en: 'Hole in One' }, desc: { ja: '1打でカップに入れる（練習はのぞく）', en: 'Make a hole in one (not in practice)' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.aces' }, gte: 1 } },
      { id: 'minigolf.ace10', tier: 3, icon: 'star', title: { ja: '一打の名人', en: 'Ace Maker' }, desc: { ja: 'ホールインワンを合わせて10回', en: 'Make 10 holes in one in total' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'stats.aces' }, gte: 10 } },
      { id: 'minigolf.under1', tier: 2, icon: 'star', title: { ja: 'パーより少なく', en: 'Under Par' }, desc: { ja: '9ホールをパーより少ない打数で回る', en: 'Finish a 9-hole round under par' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'under' }, gte: 1 } },
      { id: 'minigolf.under15', tier: 4, icon: 'trophy', title: { ja: '親方の腕前', en: "The Master's Touch" }, desc: { ja: 'コースのアンダーを合わせて15にする', en: 'Reach 15 under par across the courses' }, when: { rec: { key: 'kusoge.minigolf.save', path: 'under' }, gte: 15 } },
      { id: 'minigolf.daily3', tier: 2, icon: 'star', title: { ja: '今日のひと打ち', en: 'Daily Putter' }, desc: { ja: '今日のホールを3回遊ぶ', en: 'Play 3 daily holes' }, when: { any: [{ rec: { key: 'kusoge.minigolf.save', path: 'stats.daily' }, gte: 3 }, { stat: 'gameDaily', gte: 3 }] } },
    ],
    trade: [
      { id: 'trade.p1', tier: 1, icon: 'check', title: { ja: 'はじめての貿易', en: 'First Trade Day' }, desc: { ja: '貿易ゲームを最後まで遊ぶ', en: 'Play the Trade Game to the end' }, when: { rec: { key: 'kusoge.trade.save', path: 'plays' }, gte: 1 } },
      { id: 'trade.deal', tier: 1, icon: 'check', title: { ja: '交渉成立', en: 'Deal Done' }, desc: { ja: 'ほかの国との取引を成立させる', en: 'Close a deal with another country' }, when: { rec: { key: 'kusoge.trade.save', path: 'deals' }, gte: 1 } },
      { id: 'trade.deal20', tier: 2, icon: 'star', title: { ja: '交渉の達人', en: 'Master Negotiator' }, desc: { ja: '取引を合わせて20回成立させる', en: 'Close 20 deals in total' }, when: { rec: { key: 'kusoge.trade.save', path: 'deals' }, gte: 20 } },
      { id: 'trade.x10', tier: 2, icon: 'star', title: { ja: '10倍の成長', en: 'Tenfold Growth' }, desc: { ja: 'はじめのお金を10倍以上にする', en: 'End with 10× your starting money' }, when: { rec: { key: 'kusoge.trade.save', path: 'bestX' }, gte: 100 } },
      { id: 'trade.types', tier: 3, icon: 'trophy', title: { ja: '4つの立場', en: 'Four Viewpoints' }, desc: { ja: '先進国・新興国・産油国・途上国のすべてで遊ぶ', en: 'Play as all four country types' }, when: { rec: { key: 'kusoge.trade.save', path: 'typesN' }, gte: 4 }, grantsTitle: { ja: '世界を知る人', en: 'World Watcher' } },
      { id: 'trade.dtop', tier: 4, icon: 'trophy', title: { ja: '逆転の途上国', en: 'Against the Odds' }, desc: { ja: '途上国で8か国中4位以内に入る', en: 'Finish in the top 4 as a developing country' }, when: { rec: { key: 'kusoge.trade.save', path: 'dTop' }, gte: 1 } },
    ],
    cards: [
      { id: 'cards.om1', tier: 1, icon: 'check', title: { ja: 'ババ回避', en: 'Dodged the Joker' }, desc: { ja: 'ババ抜きで1位になる', en: 'Finish first in Old Maid' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.om.w' }, gte: 1 } },
      { id: 'cards.cn4', tier: 2, icon: 'star', title: { ja: '集中力', en: 'In the Zone' }, desc: { ja: '神経衰弱で続けて4組そろえる', en: 'Match 4 pairs in a row in Concentration' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.cnStreak' }, gte: 4 } },
      { id: 'cards.sv1', tier: 1, icon: 'check', title: { ja: '七の道', en: 'Lucky Seven' }, desc: { ja: '七並べで1位になる', en: 'Finish first in Sevens' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.sv.w' }, gte: 1 } },
      { id: 'cards.rev', tier: 2, icon: 'star', title: { ja: '革命だ！', en: 'Revolution!' }, desc: { ja: '大富豪で革命を起こす', en: 'Start a revolution in Daifugo' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.rev' }, gte: 1 } },
      { id: 'cards.dh1', tier: 2, icon: 'trophy', title: { ja: '大富豪', en: 'Grand Rich' }, desc: { ja: '大富豪で1位になる', en: 'Finish first in Daifugo' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.dh.w' }, gte: 1 } },
      { id: 'cards.cut8', tier: 2, icon: 'star', title: { ja: '8切りの名手', en: 'Eight-Cut Expert' }, desc: { ja: '8切りを合わせて5回決める', en: 'Pull off the 8-cut 5 times in total' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.cut8' }, gte: 5 } },
      { id: 'cards.flush', tier: 3, icon: 'star', title: { ja: 'フラッシュで勝負', en: 'Flush Win' }, desc: { ja: 'ポーカーでフラッシュ以上の役で勝つ', en: 'Win a poker hand with a flush or better' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.pkFlush' }, gte: 1 } },
      { id: 'cards.royal', tier: 4, icon: 'trophy', hidden: true, title: { ja: 'ロイヤルな夜', en: 'Royal Night' }, desc: { ja: 'ポーカーでロイヤルフラッシュで勝つ', en: 'Win a poker hand with a royal flush' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.royal' }, gte: 1 }, grantsTitle: { ja: 'ロイヤル', en: 'Royal' } },
      { id: 'cards.bj', tier: 2, icon: 'star', title: { ja: 'ナチュラル21', en: 'Natural 21' }, desc: { ja: 'ブラックジャックを出す', en: 'Be dealt a Blackjack' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.bj' }, gte: 1 } },
      { id: 'cards.hard', tier: 3, icon: 'trophy', title: { ja: '強敵に勝つ', en: 'Beat the Best' }, desc: { ja: '「つよい」CPUに勝って1位になる', en: 'Finish first against Hard CPUs' }, when: { rec: { key: 'kusoge.cards.save', path: 'stats.hard' }, gte: 1 } },
      { id: 'cards.all', tier: 4, icon: 'trophy', title: { ja: '広場の主', en: 'Master of the Table' }, desc: { ja: '6つのゲームすべてで1位になる', en: 'Finish first in all six games' }, when: { all: ['om', 'cn', 'sv', 'dh', 'pk', 'bj'].map(function (k) { return { rec: { key: 'kusoge.cards.save', path: 'g.' + k + '.w' }, gte: 1 }; }) }, grantsTitle: { ja: '広場の主', en: 'Table Master' } },
      { id: 'cards.jj1', tier: 1, icon: 'check', title: { ja: 'ジジを避けた', en: 'Dodged the Jiji' }, desc: { ja: 'ジジ抜きで1位になる', en: 'Finish first in Jiji-nuki' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.jj.w' }, gte: 1 } },
      { id: 'cards.sl1', tier: 1, icon: 'check', title: { ja: 'ひとりで完成', en: 'Solo Clear' }, desc: { ja: 'ソリティアをクリアする（クロンダイク）', en: 'Clear a game of Klondike' }, when: { any: [{ rec: { key: 'kusoge.cards.save', path: 'g.k1.w' }, gte: 1 }, { rec: { key: 'kusoge.cards.save', path: 'g.k3.w' }, gte: 1 }] } },
      { id: 'cards.fc1', tier: 2, icon: 'star', title: { ja: '4つのセル', en: 'Four Cells' }, desc: { ja: 'フリーセルをクリアする', en: 'Clear a game of FreeCell' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.fc.w' }, gte: 1 } },
      { id: 'cards.sp1', tier: 2, icon: 'star', title: { ja: '糸をたどる', en: 'Spinning Along' }, desc: { ja: 'スパイダーをクリアする', en: 'Clear a game of Spider' }, when: { any: [{ rec: { key: 'kusoge.cards.save', path: 'g.s1.w' }, gte: 1 }, { rec: { key: 'kusoge.cards.save', path: 'g.s2.w' }, gte: 1 }, { rec: { key: 'kusoge.cards.save', path: 'g.s4.w' }, gte: 1 }] } },
      { id: 'cards.sp4', tier: 4, icon: 'trophy', hidden: true, title: { ja: '4スートの達人', en: 'Four-Suit Master' }, desc: { ja: 'スパイダーを4スートでクリアする', en: 'Clear Spider with 4 suits' }, when: { rec: { key: 'kusoge.cards.save', path: 'g.s4.w' }, gte: 1 } },
      { id: 'cards.pts30', tier: 3, icon: 'star', title: { ja: '星30', en: 'Thirty Stars' }, desc: { ja: '★を30個ためる', en: 'Collect 30 ★' }, when: { rec: { key: 'kusoge.cards.save', path: 'pts' }, gte: 30 } },
    ],
    fit: [
      { id: 'fit.snug', tier: 1, icon: 'check', title: { ja: 'ぴったり！', en: 'Snug Fit' }, desc: { ja: 'パズルを1つ解く', en: 'Solve a puzzle' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.solved' }, gte: 1 } },
      { id: 'fit.star3', tier: 1, icon: 'star', title: { ja: '三ツ星の手ぎわ', en: 'Three-Star Hands' }, desc: { ja: 'ステージを星3つでクリアする', en: 'Clear a stage with 3 stars' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.perfect' }, gte: 1 } },
      { id: 'fit.daily', tier: 1, icon: 'check', title: { ja: '今日のぴったり', en: 'Puzzle of the Day' }, desc: { ja: '今日のパズルを解く', en: 'Solve the daily puzzle' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.daily' }, gte: 1 } },
      { id: 'fit.w1', tier: 2, icon: 'star', title: { ja: '木くず掃除', en: 'Sawdust Swept' }, desc: { ja: '1つ目の世界の16ステージをすべてクリアする', en: 'Clear all 16 stages of the first world' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.worlds' }, gte: 1 } },
      { id: 'fit.swift', tier: 2, icon: 'star', title: { ja: '電光石火', en: 'Lightning Fit' }, desc: { ja: 'ヒントなしで10秒以内にパズルを解く', en: 'Solve a puzzle in 10 seconds without a hint' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.fast' }, gte: 1 } },
      { id: 'fit.decoy', tier: 2, icon: 'check', title: { ja: 'おとりに負けない', en: 'Not Fooled' }, desc: { ja: 'ひっかけのピースがあるパズルを解く', en: 'Solve a puzzle that has decoy pieces' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.decoy' }, gte: 1 } },
      { id: 'fit.ta10', tier: 2, icon: 'star', title: { ja: '10問ダッシュ', en: 'Ten in Three' }, desc: { ja: 'タイムアタックで3分に10問解く', en: 'Solve 10 puzzles in one 3-minute time attack' }, when: { rec: { key: 'kusoge.fit.save', path: 'best' }, gte: 10 } },
      { id: 'fit.nohint', tier: 2, icon: 'check', title: { ja: 'ひとりで解いた', en: 'Unaided' }, desc: { ja: 'ヒントなしで合わせて30問解く', en: 'Solve 30 puzzles without using a hint' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.noHint' }, gte: 30 } },
      { id: 'fit.w4', tier: 3, icon: 'star', title: { ja: '真鍮の間をぬけて', en: 'Through the Brass Hall' }, desc: { ja: '4つの世界をすべてクリアする', en: 'Clear all stages of four worlds' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.worlds' }, gte: 4 } },
      { id: 'fit.stars150', tier: 3, icon: 'trophy', title: { ja: '星150', en: '150 Stars' }, desc: { ja: '星を150個ためる', en: 'Collect 150 stars' }, when: { rec: { key: 'kusoge.fit.save', path: 'stars' }, gte: 150 } },
      { id: 'fit.w8', tier: 4, icon: 'trophy', title: { ja: '親方の弟子', en: "Master's Apprentice" }, desc: { ja: '8つの世界をすべてクリアする', en: 'Clear every stage of all eight worlds' }, when: { rec: { key: 'kusoge.fit.save', path: 'stats.worlds' }, gte: 8 }, grantsTitle: { ja: '親方の弟子', en: 'Apprentice' } },
      { id: 'fit.ta25', tier: 4, icon: 'trophy', hidden: true, title: { ja: 'ぴったり名人', en: 'Fit Virtuoso' }, desc: { ja: 'タイムアタックで3分に25問解く', en: 'Solve 25 puzzles in one 3-minute time attack' }, when: { rec: { key: 'kusoge.fit.save', path: 'best' }, gte: 25 }, grantsTitle: { ja: 'ぴったり名人', en: 'Fit Virtuoso' } },
    ],
    town: [
      { id: 'town.pop10', tier: 1, icon: 'check', title: { ja: '最初のご近所さん', en: 'First Neighbours' }, desc: { ja: '人口を10人にする', en: 'Reach 10 residents' }, when: { rec: { key: 'kusoge.town.save', path: 'best' }, gte: 10 } },
      { id: 'town.build10', tier: 1, icon: 'check', title: { ja: '大工さん', en: 'Carpenter' }, desc: { ja: '建物を合わせて10こ建てる', en: 'Build 10 buildings' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.built' }, gte: 10 } },
      { id: 'town.tap1', tier: 1, icon: 'star', title: { ja: 'いらっしゃい', en: 'Welcome, Traveller' }, desc: { ja: '空をとぶ旅人にさわる', en: 'Greet a visitor' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.taps' }, gte: 1 } },
      { id: 'town.up10', tier: 2, icon: 'check', title: { ja: '育てじょうず', en: 'Green Thumb' }, desc: { ja: '建物を合わせて10回そだてる', en: 'Upgrade buildings 10 times' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.upgrades' }, gte: 10 } },
      { id: 'town.pop50', tier: 2, icon: 'star', title: { ja: 'にぎやかな通り', en: 'Busy Streets' }, desc: { ja: '人口を50人にする', en: 'Reach 50 residents' }, when: { rec: { key: 'kusoge.town.save', path: 'best' }, gte: 50 } },
      { id: 'town.kinds', tier: 2, icon: 'star', title: { ja: 'なんでもそろう', en: 'One of Everything' }, desc: { ja: '8しゅるいの建物を建てる', en: 'Build 8 kinds of buildings' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.kinds' }, gte: 8 } },
      { id: 'town.back', tier: 2, icon: 'restart', title: { ja: 'おかえりなさい', en: 'Welcome Back' }, desc: { ja: '1時間以上るすにして、町に戻る', en: 'Come back after being away for an hour or more' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.returns' }, gte: 1 } },
      { id: 'town.new1', tier: 2, icon: 'trophy', title: { ja: 'はじめての ひらきなおし', en: 'A Fresh Start' }, desc: { ja: '町をはじめてひらきなおす', en: 'Open a new town for the first time' }, when: { rec: { key: 'kusoge.town.save', path: 'tier' }, gte: 1 } },
      { id: 'town.res5', tier: 2, icon: 'star', title: { ja: '研究ずき', en: 'Curious Minds' }, desc: { ja: '研究を合わせて5回する', en: 'Buy 5 research levels' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.research' }, gte: 5 } },
      { id: 'town.gift7', tier: 3, icon: 'star', title: { ja: '毎日のおくりもの', en: 'Daily Delivery' }, desc: { ja: 'おくりものを7回受け取る', en: 'Collect the daily gift 7 times' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.gifts' }, gte: 7 } },
      { id: 'town.tap100', tier: 3, icon: 'star', title: { ja: '旅人の人気者', en: 'Friend of Travellers' }, desc: { ja: '旅人に合計100回さわる', en: 'Greet 100 visitors' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.taps' }, gte: 100 } },
      { id: 'town.pop200', tier: 3, icon: 'trophy', title: { ja: '大きな町', en: 'A Big Town' }, desc: { ja: '人口を200人にする', en: 'Reach 200 residents' }, when: { rec: { key: 'kusoge.town.save', path: 'best' }, gte: 200 } },
      { id: 'town.rest', tier: 3, icon: 'restart', title: { ja: 'ぐっすり一晩', en: 'A Good Night\'s Rest' }, desc: { ja: '8時間るすにして、町に戻る', en: 'Come back after being away for 8 hours' }, when: { rec: { key: 'kusoge.town.save', path: 'stats.awayMax' }, gte: 28800 } },
      { id: 'town.new3', tier: 4, icon: 'trophy', title: { ja: '町づくりの名人', en: 'Master Town-Builder' }, desc: { ja: '町を3回ひらきなおす', en: 'Open a new town three times' }, when: { rec: { key: 'kusoge.town.save', path: 'tier' }, gte: 3 }, grantsTitle: { ja: '町づくりの名人', en: 'Town Builder' } },
      { id: 'town.pop600', tier: 4, icon: 'trophy', hidden: true, title: { ja: '眠らない町', en: 'The Town That Never Sleeps' }, desc: { ja: '人口を600人にする', en: 'Reach 600 residents' }, when: { rec: { key: 'kusoge.town.save', path: 'best' }, gte: 600 }, grantsTitle: { ja: '町の名士', en: 'Town Notable' } },
    ],
    colorcards: [
      { id: 'colorcards.first', tier: 1, icon: 'check', title: { ja: 'はじめの一勝', en: 'First Finish' }, desc: { ja: 'CPUに勝って、手札を使い切る', en: 'Empty your hand first against the CPUs' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.wins' }, gte: 1 } },
      { id: 'colorcards.swap', tier: 1, icon: 'star', title: { ja: 'とりかえっこ', en: 'Trading Places' }, desc: { ja: '「とりかえ」で手札を入れかえる', en: 'Swap hands with a Swap card' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.swap' }, gte: 1 } },
      { id: 'colorcards.peek', tier: 1, icon: 'star', title: { ja: 'のぞき見の目', en: 'Sharp Eye' }, desc: { ja: '「のぞき見」で相手の手札を見る', en: 'Peek at a hand with a Peek card' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.peek' }, gte: 1 } },
      { id: 'colorcards.rev', tier: 1, icon: 'restart', title: { ja: 'ぐるりと逆まわし', en: 'Turn the Table' }, desc: { ja: '数字の0で向きを5回変える', en: 'Reverse the direction with a 0 five times' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.zero' }, gte: 5 } },
      { id: 'colorcards.call', tier: 2, icon: 'check', title: { ja: 'ラスト！の名人', en: 'Last-Call Habit' }, desc: { ja: '「ラスト！」を10回宣言する', en: 'Call "Last!" 10 times' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.calls' }, gte: 10 } },
      { id: 'colorcards.catch', tier: 2, icon: 'star', title: { ja: '見のがさない', en: 'Eagle Ears' }, desc: { ja: '言い忘れた相手を「つかまえた！」する', en: 'Catch a rival who forgot to call "Last!"' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.catches' }, gte: 1 } },
      { id: 'colorcards.tangle', tier: 2, icon: 'star', title: { ja: 'からまりの達人', en: 'Master of Tangles' }, desc: { ja: '「からまり」を合わせて10回決める', en: 'Land 10 Tangles in total' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.tangle' }, gte: 10 } },
      { id: 'colorcards.block', tier: 2, icon: 'check', title: { ja: 'まもり糸、きらり', en: 'Thread of Protection' }, desc: { ja: '「まもり糸」で攻撃をはね返す', en: 'Bounce an attack with a Shield' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.block' }, gte: 1 } },
      { id: 'colorcards.dye', tier: 2, icon: 'star', title: { ja: '染めもの上手', en: 'Dye Works' }, desc: { ja: '「染め直し」を10回使う', en: 'Play Re-dye 10 times' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.dye' }, gte: 10 } },
      { id: 'colorcards.win10', tier: 2, icon: 'trophy', title: { ja: '十勝', en: 'Ten Wins' }, desc: { ja: '合わせて10回勝つ', en: 'Win 10 games in total' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.wins' }, gte: 10 } },
      { id: 'colorcards.hard', tier: 3, icon: 'trophy', title: { ja: '強敵に勝つ', en: 'Beat the Best' }, desc: { ja: '「つよい」CPUに勝つ', en: 'Win against Hard CPUs' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.hard' }, gte: 1 } },
      { id: 'colorcards.dbl', tier: 3, icon: 'star', title: { ja: 'ふた針でフィニッシュ', en: 'Double Finish' }, desc: { ja: '「ふた針」のあと、続けて最後の札を出す', en: 'Play your last card right after a Double' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.dblOut' }, gte: 1 } },
      { id: 'colorcards.comeback', tier: 3, icon: 'trophy', title: { ja: '大逆転', en: 'Great Comeback' }, desc: { ja: '手札が12枚以上になっても、最後には勝つ', en: 'Win after holding 12 or more cards' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.comeback' }, gte: 1 } },
      { id: 'colorcards.match', tier: 3, icon: 'trophy', title: { ja: '10ラウンドの覇者', en: 'Match Champion' }, desc: { ja: '10ラウンドマッチで1位になる', en: 'Win a 10-round match' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.matchWins' }, gte: 1 } },
      { id: 'colorcards.pts30', tier: 3, icon: 'star', title: { ja: '星30', en: 'Thirty Stars' }, desc: { ja: '★を30個ためる', en: 'Collect 30 ★' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'pts' }, gte: 30 } },
      { id: 'colorcards.nodraw', tier: 4, icon: 'trophy', hidden: true, title: { ja: 'ひと息であがり', en: 'Not a Single Draw' }, desc: { ja: '一度も山札をひかずに勝つ', en: 'Win without ever drawing from the deck' }, when: { rec: { key: 'kusoge.colorcards.save', path: 'stats.noDraw' }, gte: 1 }, grantsTitle: { ja: '糸の名人', en: 'Thread Master' } },
    ],
    brawl: [
      { id: 'brawl.first', tier: 1, icon: 'check', title: { ja: 'はじめの一勝', en: 'First Win' }, desc: { ja: 'CPUに勝つ', en: 'Beat a CPU in a match' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.wins' }, gte: 1 } },
      { id: 'brawl.ledge', tier: 1, icon: 'star', title: { ja: 'ふちにぶらさがり', en: 'Hanging On' }, desc: { ja: 'ステージの縁につかまる', en: 'Grab a ledge' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.ledge' }, gte: 1 } },
      { id: 'brawl.grab', tier: 1, icon: 'star', title: { ja: 'つかんでポイ', en: 'Grab and Toss' }, desc: { ja: '相手をつかむ', en: 'Grab an opponent' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.grab' }, gte: 1 } },
      { id: 'brawl.twop', tier: 1, icon: 'check', title: { ja: 'ふたりで勝負', en: 'Head to Head' }, desc: { ja: '1台でふたりで対戦する', en: 'Play a two-player match on one device' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.twop' }, gte: 1 } },
      { id: 'brawl.train', tier: 1, icon: 'check', title: { ja: 'まずはれんしゅう', en: 'Practice First' }, desc: { ja: 'れんしゅうモードで遊ぶ', en: 'Try Training mode' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.train' }, gte: 1 } },
      { id: 'brawl.ko10', tier: 2, icon: 'star', title: { ja: 'ふっとばし屋', en: 'Launcher' }, desc: { ja: '合わせて10回ふっとばす', en: 'Knock out opponents 10 times in total' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.kos' }, gte: 10 } },
      { id: 'brawl.smash', tier: 2, icon: 'star', title: { ja: '大技で場外へ', en: 'Smashed Out' }, desc: { ja: '「つよい攻撃」でふっとばす', en: 'Knock someone out with a smash attack' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.smashKo' }, gte: 1 } },
      { id: 'brawl.block', tier: 2, icon: 'check', title: { ja: 'バリアの達人', en: 'Shield Master' }, desc: { ja: 'まもりで攻撃を10回ふせぐ', en: 'Block 10 attacks with your shield' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.block' }, gte: 10 } },
      { id: 'brawl.counter', tier: 2, icon: 'star', title: { ja: 'カウンター成功', en: 'Turned the Tables' }, desc: { ja: 'アヒル騎士のカウンターを決める', en: "Land the Duck Knight's counter" }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.counter' }, gte: 1 } },
      { id: 'brawl.combo5', tier: 2, icon: 'star', title: { ja: 'つながるコンボ', en: 'Combo Chain' }, desc: { ja: '5ヒットのコンボを決める', en: 'Land a 5-hit combo' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.maxCmb' }, gte: 5 } },
      { id: 'brawl.ffa', tier: 2, icon: 'trophy', title: { ja: '4人乱闘の勝者', en: 'Last Toy Standing' }, desc: { ja: '4人の乱闘で勝つ', en: 'Win a four-way free-for-all' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.ffa' }, gte: 1 } },
      { id: 'brawl.timed', tier: 2, icon: 'check', title: { ja: 'タイムアップの勝者', en: 'Beat the Clock' }, desc: { ja: '時間制の試合で勝つ', en: 'Win a timed match' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.timed' }, gte: 1 } },
      { id: 'brawl.lad4', tier: 2, icon: 'trophy', title: { ja: 'ラダーの半分', en: 'Halfway Up' }, desc: { ja: 'ラダーで合わせて4勝する', en: 'Win 4 fights on the ladder' }, when: { rec: { key: 'kusoge.brawl.save', path: 'lw' }, gte: 4 } },
      { id: 'brawl.hard', tier: 3, icon: 'trophy', title: { ja: '強敵に勝つ', en: 'Beat the Best' }, desc: { ja: '「つよい」CPUに勝つ', en: 'Win against a Hard CPU' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.hard' }, gte: 1 } },
      { id: 'brawl.perfect', tier: 3, icon: 'trophy', title: { ja: 'ノーミスの勝利', en: 'Flawless' }, desc: { ja: '残機を1つも失わずに勝つ', en: 'Win without losing a stock' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.perfect' }, gte: 1 } },
      { id: 'brawl.spike', tier: 3, icon: 'star', title: { ja: '流れ星', en: 'Shooting Star' }, desc: { ja: '空中の下づきで、相手をまっさかさまに落とす', en: 'Spike an opponent straight down with a down-air' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.spike' }, gte: 1 } },
      { id: 'brawl.ko100', tier: 3, icon: 'trophy', title: { ja: '百人ぬき', en: 'Hundred KOs' }, desc: { ja: '合わせて100回ふっとばす', en: 'Knock out opponents 100 times in total' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.kos' }, gte: 100 } },
      { id: 'brawl.all', tier: 3, icon: 'trophy', title: { ja: 'おもちゃコレクター', en: 'Toy Collector' }, desc: { ja: '18人のおもちゃをぜんぶ開く', en: 'Unlock all eighteen toys' }, when: { rec: { key: 'kusoge.brawl.save', path: 'un.c', measure: 'count' }, gte: 18 } },
      { id: 'brawl.pshield', tier: 2, icon: 'check', title: { ja: 'ジャストガード', en: 'Perfect Shield' }, desc: { ja: '攻撃をまもりの出しはじめで受ける（ジャストガード）', en: 'Block an attack the moment you raise your shield (a perfect shield)' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.pshield' }, gte: 1 } },
      { id: 'brawl.tech', tier: 1, icon: 'check', title: { ja: 'うけ身', en: 'Tech It' }, desc: { ja: '飛ばされて、地面やかべで うけ身をとる', en: 'Tech off the floor or a wall after being launched' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.tech' }, gte: 1 } },
      { id: 'brawl.flick', tier: 2, icon: 'star', title: { ja: 'はじき強攻撃', en: 'Flick Smash' }, desc: { ja: 'スティックをはじいて（キーボードは2回おし）、強攻撃を出す', en: 'Flick the stick (or double-tap on a keyboard) and throw a smash attack' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.flick' }, gte: 1 } },
      { id: 'brawl.tour6', tier: 2, icon: 'star', title: { ja: 'おもちゃいろいろ', en: 'Toy Box Tour' }, desc: { ja: '6人のちがうおもちゃで遊ぶ', en: 'Play with six different toys' }, when: { rec: { key: 'kusoge.brawl.save', path: 'cp', measure: 'count' }, gte: 6 } },
      { id: 'brawl.tour18', tier: 4, icon: 'trophy', title: { ja: '18人ぜんいん', en: 'The Whole Cast' }, desc: { ja: '18人のおもちゃ、ぜんぶで遊ぶ', en: 'Play a match with every one of the eighteen toys' }, when: { rec: { key: 'kusoge.brawl.save', path: 'cp', measure: 'count' }, gte: 18 } },
      { id: 'brawl.clear', tier: 3, icon: 'trophy', title: { ja: 'ラダー制覇', en: 'Ladder Cleared' }, desc: { ja: 'ラダーの8戦をぬける', en: 'Clear all 8 fights of the ladder' }, when: { rec: { key: 'kusoge.brawl.save', path: 'cl' }, gte: 1 } },
      { id: 'brawl.score15k', tier: 4, icon: 'trophy', title: { ja: '1万5千点', en: 'Fifteen Thousand' }, desc: { ja: 'ラダー1周で15000点をとる', en: 'Score 15,000 in one ladder run' }, when: { rec: { key: 'kusoge.brawl.save', path: 'best' }, gte: 15000 } },
      { id: 'brawl.boss', tier: 4, icon: 'trophy', hidden: true, title: { ja: 'ガラクタ大王をたおした', en: 'Junk King Down' }, desc: { ja: 'ラダーの最後のボスに勝つ', en: 'Defeat the final boss of the ladder' }, when: { rec: { key: 'kusoge.brawl.save', path: 'stats.boss' }, gte: 1 }, grantsTitle: { ja: '工房の王者', en: 'Workshop Champion' } },
    ],
    train: [
      { id: 'train.first', tier: 1, icon: 'check', title: { ja: 'はじめての運転', en: 'First Run' }, desc: { ja: 'どれかのルートを★1でクリアする', en: 'Clear any route with at least ★1' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.clears' }, gte: 1 } },
      { id: 'train.pita', tier: 1, icon: 'star', title: { ja: 'ぴたり停車', en: 'Spot On' }, desc: { ja: '停止位置から0.6m以内で止める', en: 'Stop within 0.6 m of the marker' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.pita' }, gte: 1 } },
      { id: 'train.ontime', tier: 1, icon: 'check', title: { ja: '定時運転', en: 'Right on Time' }, desc: { ja: 'ダイヤとのずれ2秒以内で駅につく', en: 'Arrive within 2 seconds of the timetable' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.ontime' }, gte: 1 } },
      { id: 'train.smooth', tier: 1, icon: 'star', title: { ja: 'やさしい運転', en: 'Gentle Hands' }, desc: { ja: '乗りごこち95%以上の区間をつくる', en: 'Finish a leg with 95% ride comfort or better' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.smooth' }, gte: 1 } },
      { id: 'train.wait', tier: 2, icon: 'check', title: { ja: '赤信号で待つ', en: 'Wait for Green' }, desc: { ja: '赤信号の前で止まって、青を待つ', en: 'Stop and wait at a red signal' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.waits' }, gte: 1 } },
      { id: 'train.stop50', tier: 2, icon: 'trophy', title: { ja: '50回停車', en: 'Fifty Stops' }, desc: { ja: '合わせて50回、駅に止める', en: 'Make 50 station stops in total' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.stops' }, gte: 50 } },
      { id: 'train.pita10', tier: 2, icon: 'star', title: { ja: 'ぴたりの名人', en: 'Marker Master' }, desc: { ja: '0.6m以内の停車を10回', en: 'Make 10 stops within 0.6 m' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.pita' }, gte: 10 } },
      { id: 'train.line2', tier: 2, icon: 'trophy', title: { ja: 'うみかぜ線が開く', en: 'Seaside Opens' }, desc: { ja: '★を4つ集めて、うみかぜ線を開く', en: 'Earn 4 stars to open the Umikaze Line' }, when: { rec: { key: 'kusoge.train.save', path: 'un.l2' }, gte: 1 } },
      { id: 'train.rain', tier: 2, icon: 'check', title: { ja: '雨の日の運転', en: 'Rainy Day Driver' }, desc: { ja: '「あめのうみかぜ」をクリアする', en: 'Clear Rainy Seaside' }, when: { rec: { key: 'kusoge.train.save', path: 'r.r5.s' }, gte: 1 } },
      { id: 'train.night', tier: 2, icon: 'star', title: { ja: '夜の運転士', en: 'Night Driver' }, desc: { ja: '夜のルートをクリアする', en: 'Clear a night route' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.night' }, gte: 1 } },
      { id: 'train.three', tier: 3, icon: 'trophy', title: { ja: '★3の運転士', en: 'Three-Star Driver' }, desc: { ja: 'どれかのルートを★3でクリアする', en: 'Clear any route with three stars' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.three' }, gte: 1 } },
      { id: 'train.line3', tier: 3, icon: 'trophy', title: { ja: 'ほしぞら線が開く', en: 'Starlight Opens' }, desc: { ja: '★を12個集めて、ほしぞら線を開く', en: 'Earn 12 stars to open the Hoshizora Line' }, when: { rec: { key: 'kusoge.train.save', path: 'un.l3' }, gte: 1 } },
      { id: 'train.snow', tier: 3, icon: 'check', title: { ja: '雪の夜の運転', en: 'Snowy Night' }, desc: { ja: '「ゆきのほしぞら」をクリアする', en: 'Clear Snowy Starlight' }, when: { rec: { key: 'kusoge.train.save', path: 'r.r8.s' }, gte: 1 } },
      { id: 'train.gold', tier: 3, icon: 'star', title: { ja: '満点に近い区間', en: 'Near Perfect Leg' }, desc: { ja: '1区間で950点以上をとる', en: 'Score 950 or more on a single leg' }, when: { rec: { key: 'kusoge.train.save', path: 'stats.gold' }, gte: 1 } },
      { id: 'train.stars15', tier: 3, icon: 'trophy', title: { ja: '★15', en: 'Fifteen Stars' }, desc: { ja: '★を15個集める', en: 'Collect 15 stars' }, when: { rec: { key: 'kusoge.train.save', path: 'stars' }, gte: 15 } },
      { id: 'train.pts15k', tier: 4, icon: 'trophy', title: { ja: '合計15000点', en: 'Fifteen Thousand' }, desc: { ja: 'ルートのベスト得点の合計が15000点', en: 'Reach a 15,000-point total across your best routes' }, when: { rec: { key: 'kusoge.train.save', path: 'total' }, gte: 15000 } },
      { id: 'train.fog', tier: 4, icon: 'trophy', title: { ja: '霧の特急', en: 'Fog Express' }, desc: { ja: '「ひなた特急 ぜんせん」をクリアする', en: 'Clear Grand Limited' }, when: { rec: { key: 'kusoge.train.save', path: 'r.r9.s' }, gte: 1 }, grantsTitle: { ja: '名運転士', en: 'Master Driver' } },
    ],
    reversi: [
      { id: 'reversi.first', tier: 1, icon: 'check', title: { ja: 'はじめの一勝', en: 'First Win' }, desc: { ja: 'CPUに勝つ', en: 'Beat the CPU' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.wins' }, gte: 1 } },
      { id: 'reversi.corner', tier: 1, icon: 'star', title: { ja: '角をとった', en: 'Corner Taken' }, desc: { ja: '四隅のどれかに石を置く', en: 'Place a stone on a corner' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.corners' }, gte: 1 } },
      { id: 'reversi.pass', tier: 1, icon: 'check', title: { ja: 'パスに追い込む', en: 'Forced Pass' }, desc: { ja: 'CPUが置けなくなってパスする', en: 'Leave the CPU with no move so it must pass' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.pass' }, gte: 1 } },
      { id: 'reversi.twop', tier: 1, icon: 'check', title: { ja: 'ふたりで勝負', en: 'Head to Head' }, desc: { ja: '1台でふたりで最後まで遊ぶ', en: 'Finish a two-player game on one device' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.twop' }, gte: 1 } },
      { id: 'reversi.pz1', tier: 1, icon: 'star', title: { ja: '最善手を見つけた', en: 'Best Move Found' }, desc: { ja: '今日のパズルで正解する', en: 'Solve a daily puzzle' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.pz' }, gte: 1 } },
      { id: 'reversi.six', tier: 1, icon: 'check', title: { ja: '小さな盤の勝者', en: 'Small Board Winner' }, desc: { ja: '6×6の盤でCPUに勝つ', en: 'Beat the CPU on the 6x6 board' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.six' }, gte: 1 } },
      { id: 'reversi.win10', tier: 2, icon: 'trophy', title: { ja: '十勝', en: 'Ten Wins' }, desc: { ja: '合わせて10回勝つ', en: 'Win 10 games in total' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.wins' }, gte: 10 } },
      { id: 'reversi.lv3', tier: 2, icon: 'trophy', title: { ja: '強い相手に勝つ', en: 'Beat a Hard CPU' }, desc: { ja: '「つよい」以上のCPUに勝つ', en: 'Win against a Hard or Expert CPU' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.lv3' }, gte: 1 } },
      { id: 'reversi.corner4', tier: 2, icon: 'star', title: { ja: '四隅をぜんぶ', en: 'All Four Corners' }, desc: { ja: '四隅をぜんぶとって勝つ', en: 'Win a game holding all four corners' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.corner4' }, gte: 1 } },
      { id: 'reversi.big', tier: 2, icon: 'star', title: { ja: '大差で勝つ', en: 'Landslide' }, desc: { ja: '石の数で30個以上の差をつけて勝つ', en: 'Win by 30 stones or more' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.big' }, gte: 1 } },
      { id: 'reversi.pz20', tier: 2, icon: 'trophy', title: { ja: 'パズルの常連', en: 'Puzzle Regular' }, desc: { ja: '今日のパズルに合わせて20問正解する', en: 'Solve 20 daily puzzles in total' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.pz' }, gte: 20 } },
      { id: 'reversi.dperf', tier: 3, icon: 'trophy', title: { ja: '5問ぜんぶ正解', en: 'Perfect Day' }, desc: { ja: '今日のパズル5問をぜんぶ正解する', en: 'Solve all five of a day\'s puzzles' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.dperf' }, gte: 1 } },
      { id: 'reversi.hard', tier: 3, icon: 'trophy', title: { ja: '最強に勝つ', en: 'Beat the Best' }, desc: { ja: '「とてもつよい」CPUに勝つ', en: 'Win against an Expert CPU' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.hard' }, gte: 1 } },
      { id: 'reversi.onw', tier: 3, icon: 'star', title: { ja: 'オンラインで勝つ', en: 'Online Victory' }, desc: { ja: 'オンライン対戦で勝つ', en: 'Win an online match' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.onw' }, gte: 1 } },
      { id: 'reversi.pts30', tier: 3, icon: 'star', title: { ja: '星30', en: 'Thirty Stars' }, desc: { ja: '★を30個ためる', en: 'Collect 30 ★' }, when: { rec: { key: 'kusoge.reversi.save', path: 'pts' }, gte: 30 } },
      { id: 'reversi.hard5', tier: 4, icon: 'trophy', title: { ja: '最強のライバル', en: 'Expert Rival' }, desc: { ja: '「とてもつよい」CPUに5回勝つ', en: 'Beat an Expert CPU 5 times' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.hard' }, gte: 5 }, grantsTitle: { ja: 'リバーシの達人', en: 'Reversi Master' } },
      { id: 'reversi.wipe', tier: 4, icon: 'trophy', hidden: true, title: { ja: '全部ひっくり返した', en: 'Total Wipe-out' }, desc: { ja: '相手の石を1つ残らずひっくり返して勝つ', en: 'Win by flipping every last stone of the opponent' }, when: { rec: { key: 'kusoge.reversi.save', path: 'stats.wipe' }, gte: 1 } },
    ],
    manabi: [
      { id: 'manabi.first', tier: 1, icon: 'check', title: { ja: 'はじめのレッスン', en: 'First Lesson' }, desc: { ja: 'レッスンを1つ終える', en: 'Finish a lesson' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.ls' }, gte: 1 } },
      { id: 'manabi.ls10', tier: 1, icon: 'check', title: { ja: '10レッスン', en: 'Ten Lessons' }, desc: { ja: 'レッスンを合わせて10回終える', en: 'Finish 10 lessons in total' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.ls' }, gte: 10 } },
      { id: 'manabi.ok100', tier: 2, icon: 'star', title: { ja: '100問せいかい', en: '100 Correct' }, desc: { ja: '合わせて100問に正解する', en: 'Answer 100 questions correctly' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.ok' }, gte: 100 } },
      { id: 'manabi.streak3', tier: 1, icon: 'star', title: { ja: '3日れんぞく', en: 'Three-Day Streak' }, desc: { ja: '3日つづけて勉強する', en: 'Study 3 days in a row' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.best' }, gte: 3 } },
      { id: 'manabi.streak7', tier: 2, icon: 'trophy', title: { ja: '7日れんぞく', en: 'Week-Long Streak' }, desc: { ja: '7日つづけて勉強する', en: 'Study 7 days in a row' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.best' }, gte: 7 } },
      { id: 'manabi.quest', tier: 1, icon: 'check', title: { ja: 'クエストたっせい', en: 'Quest Done' }, desc: { ja: '今日のクエストをクリアして、ごほうびを受け取る', en: 'Complete a daily quest and claim the reward' }, when: { rec: { key: 'kusoge.manabi.save', path: 'dq.c', measure: 'sum' }, gte: 1 } },
      { id: 'manabi.mock', tier: 2, icon: 'check', title: { ja: 'はじめての模試', en: 'First Mock Exam' }, desc: { ja: '模試を1回さいごまで解く', en: 'Finish a mock exam' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.mk' }, gte: 1 } },
      { id: 'manabi.xp1000', tier: 3, icon: 'trophy', title: { ja: '1000 XP', en: '1,000 XP' }, desc: { ja: 'XPを合わせて1000ためる', en: 'Earn 1,000 XP in total' }, when: { rec: { key: 'kusoge.manabi.save', path: 'xp' }, gte: 1000 } },
      { id: 'manabi.league', tier: 3, icon: 'trophy', title: { ja: 'リーグしょうかく', en: 'League Promotion' }, desc: { ja: '週のリーグで上位に入って、次のリーグへ上がる', en: 'Finish near the top of the weekly league and move up' }, when: { rec: { key: 'kusoge.manabi.save', path: 'lg.t' }, gte: 1 } },
      { id: 'manabi.crown', tier: 3, icon: 'trophy', title: { ja: '王冠をゲット', en: 'Crowned' }, desc: { ja: '特別コースで王冠を1つ手に入れる', en: 'Earn a crown in a special course' }, when: { rec: { key: 'kusoge.manabi.save', path: 'cw', measure: 'countGte', min: 1 }, gte: 1 } },
      { id: 'manabi.ok1000', tier: 4, icon: 'trophy', title: { ja: '1000問せいかい', en: '1,000 Correct' }, desc: { ja: '合わせて1000問に正解する', en: 'Answer 1,000 questions correctly' }, when: { rec: { key: 'kusoge.manabi.save', path: 'st.ok' }, gte: 1000 }, grantsTitle: { ja: 'まなびの名人', en: 'Study Master' } },
    ],
    orchestra: [
      { id: 'orchestra.fin1', tier: 1, icon: 'check', title: { ja: 'はじめての演奏', en: 'First Performance' }, desc: { ja: '曲を最後まで指揮する', en: 'Conduct a piece to the end' }, when: { rec: { key: 'kusoge.orchestra.save', path: 'stats.finishes' }, gte: 1 } },
      { id: 'orchestra.three', tier: 2, icon: 'star', title: { ja: '星3つの演奏', en: 'Three-Star Concert' }, desc: { ja: 'どれかの曲で★3をとる', en: 'Earn three stars on any piece' }, when: { rec: { key: 'kusoge.orchestra.save', path: 'stats.three' }, gte: 1 } },
      { id: 'orchestra.perfect20', tier: 2, icon: 'star', title: { ja: '入りの名人', en: 'Cue Master' }, desc: { ja: '「ばっちり」の入りを合わせて20回出す', en: 'Give 20 perfect cues in total' }, when: { rec: { key: 'kusoge.orchestra.save', path: 'stats.perfect' }, gte: 20 } },
      { id: 'orchestra.tour', tier: 3, icon: 'trophy', title: { ja: '8曲を指揮した', en: 'Eight Pieces' }, desc: { ja: 'どれでも8曲を「ふつう」で最後まで指揮する', en: 'Conduct any eight pieces to the end on Normal' }, when: { rec: { key: 'kusoge.orchestra.save', path: 'p', each: 's1', measure: 'countGte', min: 1 }, gte: 8 } },
      { id: 'orchestra.three5', tier: 4, icon: 'trophy', title: { ja: '★3のコンサート', en: 'Standing Ovation' }, desc: { ja: '★3の演奏を合わせて5回する', en: 'Earn three stars five times in total' }, when: { rec: { key: 'kusoge.orchestra.save', path: 'stats.three' }, gte: 5 }, grantsTitle: { ja: 'マエストロ', en: 'Maestro' } },
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
