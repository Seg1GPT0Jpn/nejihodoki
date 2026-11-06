# システム構成（目標）

前提：静的ホスティング（Firebase Hosting と GitHub Pages）、ビルドなし、素の HTML/JS。Three.js r128（cdnjs）、Firebase compat SDK 10.12.2（jsDelivr）。Firebase は `neji-5913a` の Spark プラン。Cloud Functions は使いません（オーナーの決定）。

## 1. 全体の構成

```
index.html（ホーム） ranking/ profile/ about/      ← ハブのページ
<game>/index.html（1ゲーム＝1ファイル。必要なら <game>/engine.js）
common/
  games.js      ゲームの登録簿（データだけ。SW からも importScripts で読む）
  platform.js   KoboPlatform：保存の補助、イベント、日本時間の日付と seed、履歴、お気に入り、XP、実績、デイリー、プレイ回数、テーマの適用
  game.js       KoboGame：ゲーム側の約束事（register、pause/resume/dispose、イベントの報告、共通メニュー）
  audio.js      KoboAudio：共通の AudioContext、全体と効果音の音量（BGM のバスは用意だけして隠す）
  theme.css     テーマの CSS トークン（ライトとダーク）
  ui.css / ui.js 共通の UI 部品（上のバー、結果カード、トースト、確認ダイアログ）
  cloud.js      既存：認証と同期（マージの種類を追加、書き込みをまとめる、匿名とリンク）
  rank.js       KoboRank：ランキングの送信と取得（通算・週間・日間・チャレンジ）
  i18n.js       既存：対象ゲームの一覧をレジストリから読むように変える
  versus.js     既存：オンライン対戦
  news.json     お知らせ（オーナーが git で編集する）
tools/tests/    自動テスト（TEST_PLAN.md）
docs/           この設計書（公開先からは除外する）
```

読み込みの順番（ゲームのページ）：
`<head>`：`common/theme.css` → `common/i18n.js` → `common/games.js` → `common/platform.js`（テーマをすぐ当てて、画面がちらつかないようにする）→ `common/audio.js` → `common/versus.js`
`</body>` の前：ゲーム本体 → `common/game.js` → `firebase-config.js` → `common/cloud.js` → `common/rank.js`

`common/*` はどれも、ほかのモジュールがなくても動くようにします。各ゲームは `window.KoboGame && KoboGame.register(...)` のように確かめてから呼ぶので、移行の途中でもゲームは壊れません。

## 2. ゲームの登録簿 `common/games.js`

```js
window.KOBO_GAMES = [
  { id: 'blocks', path: 'blocks/', added: '2026-10-01',
    title: { ja: 'ブロックはめ', en: 'Block Fit' },
    desc: { ja: '8×8の盤に…', en: 'Fit three blocks…' },
    genres: ['puzzle'], tags: ['casual', 'endless'], keywords: { ja: ['ブロック', 'パズル'], en: ['block'] },
    thumb: 'img/thumbs/blocks.webp', thumb2x: 'img/thumbs/blocks@2x.webp', icon: 'img/icons/blocks.svg',
    tech: '2d',              // '2d' | '3d'（3D は低画質モードの対象）
    flags: { ranking: true, achievements: true, daily: true, versus: true, pause: false, stages: false },
    score: { unit: { ja: '点', en: 'pts' }, order: 'desc', cap: 50000000, maxRate: 4000 /* 1秒あたりの点数の上限（仮） */ },
    rankSource: { key: 'kusoge.blocks.best', path: null, offset: 0 },   // 既存の RANK_SOURCES を置き換える
    sync: { 'kusoge.blocks.best': 'max', 'kusoge.blocks.state': 'newest' },
  },
  …
];
window.KOBO_GENRES = [{ id: 'puzzle', ja: 'パズル', en: 'Puzzle' }, …];
```
- 監査 R23 で見つけた、7か所に直書きされた一覧の代わりです。ハブ、ランキング、`cloud.js` の `RANK_SOURCES`、`sw.js` の `GAMES`（`importScripts('common/games.js')`）、`i18n.js` の `fitViewport`、ハブの同期キーは、すべてここから作ります。
- `sync` は、ハブで同期するキーの一覧も兼ねます（今は index.html:346 に直書き）。
- `cap` と `maxRate` は、Phase 1 で今のランキングの実データと、テストで遊んだ結果から決めます（下の値は仮のものです）。

## 3. ゲーム側の約束事 `KoboGame`（`common/game.js`）

```js
KoboGame.register({
  id: 'blocks',
  pause() {},            // 止める（入力・時間・音）。何度呼ばれてもよいこと
  resume() {},           // 再開できるようにする（実際の再開はプレイヤーが「つづける」を押したとき）
  dispose() {},          // WebGL・AudioNode・タイマー・リスナーを解放する（テストと、context lost からの復帰に使う）
  isIdle() { return !playing; },   // 遊んでいないなら true（cloud.js が自動で再読み込みしてよいか判断する）
  daily: { start({ seed, dateKey }) {} },   // flags.daily のゲームだけ
  menu: { extra: [] },   // 共通メニューに足す項目（任意）
});
KoboGame.emit('play_start', { mode: 'normal' | 'daily' | 'versus' | 'practice', seed?, stage? });
KoboGame.emit('play_end',   { score, durationMs, reason: 'over' | 'clear' | 'quit', stage?, stats?: {…}, replay?: string });
KoboGame.emit('best',       { score });                    // 自己ベストを更新した
KoboGame.emit('stage_clear',{ stage, stars?, timeMs?, moves? });
KoboGame.emit('progress',   { key, value });               // 実績用の数値（例：'lines', 120）
// 'achievement' はプラットフォームが出すイベント（ゲームは KoboGame.on('achievement', f) で受け取る）
```
- **一時停止**：`game.js` が `visibilitychange`（hidden）、`pagehide`、共通メニューを開いたとき、`versus` の `onOpen` のときに `pause()` を呼びます。`flags.pause:false`（手番制）のゲームでは保存するだけです。
- **イベントの処理**：`platform.js` が受け取り、履歴、統計、XP、実績、デイリー、ランキングの送信、プレイ回数を更新します。ゲームは**保存**だけは今までどおり自分で行います（キーは変えない）。
- **既存の対戦**：`mode:'versus'` の `play_end` は履歴と XP にだけ使い、ランキングとデイリーには入れません（versus.js の決まり「対戦中はベストを更新しない」と同じ）。
- **起動のパラメータ**：`KoboPlatform.launch()` は `?daily=YYYYMMDD`、`?stage=N`、`?code=…`（ステージの共有コード）を読みます。ハブの「今日のチャレンジ」は `blocks/?daily=20261104` を開きます。

## 4. XP・ランク・称号

### 4.1 獲得する量（1回の `play_end` ごと）
| 内容 | XP |
| --- | --- |
| 遊んだ（`durationMs ≥ 20秒`、または `stage_clear` があったとき） | 5 |
| 遊んだ時間 | 1分あたり3、最大15（5分ぶん） |
| ステージのクリア | 1回10、1プレイで最大3回まで |
| 自己ベストの更新（1プレイで1回） | 20 |
| デイリーチャレンジを初めてクリア（1ゲーム1日1回） | 50 |
| 実績 | 実績ごと（10 / 25 / 50 / 100） |

### 4.2 上限（同じことの繰り返しで稼げないように）
- 1つのゲームから1日（日本時間）に得られるのは **200 XP** まで（デイリーと実績は除く）。
- 全ゲームを合わせて1日 **800 XP** まで（デイリーと実績は除く）。
- 20秒未満のプレイが続く場合（直近10回中8回以上）は、その日はそのゲームの「遊んだ」XP を0にする。
- `mode:'practice'` は0。

### 4.3 レベル
- レベル L から L+1 に上がるのに必要な XP：`need(L) = 50 + 25 × L`。累計は `25L² + 25L` の近く（Lv10 で約2,750、Lv30 で約23,000）。
- 称号（ランクの名前）：Lv1 見習い／Lv5 常連／Lv10 腕きき／Lv20 職人／Lv30 名人／Lv50 匠／Lv80 ひまつぶしの達人。英語の名前は辞書に入れます。
- 実績の称号：実績の定義に `title` があれば手に入り、プロフィールで1つ選べます。

### 4.4 記録の形（複数の端末でも正しく足せるように）
`kobo.xp = { v:1, d: { "20261104": { "<devId>": { "blocks": 120, "_d": 50, "_a": 25 } } }, arch: 3400 }`
- `devId` は端末ごとの乱数（`kobo.dev`。同期しない）。マージするときは、(日, 端末, キー) ごとに大きい方を取ります。
- 1日の合計は、全端末の合計に 4.2 の上限をかけた値です。35日より古い分は `arch` にまとめます（`arch` は大きい方を取る）。

## 5. 実績の定義の形

```js
// common/achievements.js（全体の実績）と、registry の games[i].achievements（ゲームごと）
{ id: 'blocks.score.10k', game: 'blocks', tier: 2, xp: 25, hidden: false,
  title: { ja: '一万点はめ', en: '10k Fitter' }, desc: { ja: '1回で10,000点', en: 'Score 10,000 in one game' },
  when: { ev: 'play_end', field: 'score', gte: 10000, modes: ['normal', 'daily'] } }
{ id: 'all.variety.5', game: null, tier: 1, xp: 25, title: {…}, desc: {…},
  when: { stat: 'distinctGames', gte: 5 } }
{ id: 'all.daily.streak7', game: null, tier: 3, xp: 50, when: { stat: 'dailyStreak', gte: 7 }, grantsTitle: { ja: '毎日の人', en: 'Daily Regular' } }
```
- `when` は宣言で書きます（`ev`＋`field`、または `stat`）。宣言で書けないものだけ `check(ctx)` という関数にします。
- 取った実績は `kobo.ach = { id: 取った時刻 }` に記録し、マージは和集合（時刻は早い方）です。取ると `achievement` イベントが出て、トーストを表示します。
- 前から持っている記録で取れる実績（例：ネジほどきの LEVEL 50）は、初めて起動したときに一度だけさかのぼって判定します。

## 6. デイリーチャレンジ

- **日付**：`jstDateKey(ms = Date.now()) = 日本時間の YYYYMMDD の数値`。計算は `new Date(ms + 9h)` の UTC のフィールドで行います。端末のタイムゾーンには左右されません。
- **seed**：`hash32('kobo:' + gameId + ':' + dateKey)`（xmur3）→ `KoboPlatform.rng(seed)`（mulberry32。versus.js:79 と同じ）。
- **回数**：何度でも挑戦でき、いちばん良い結果が記録とランキングに残ります。
- **記録**：`kobo.daily = { "20261104": { blocks: { best, tries, clearedAt } } }`。マージはフィールドごと（best は良い方、tries は大きい方、clearedAt は早い方）。60日より古い分は消します。
- **ゲームごとの内容**：

| ゲーム | デイリーの内容 | 順位の値 |
| --- | --- | --- |
| neji | 今のまま（`startLevel(12 + key % 7, { seed: key, model: key % MODELS.length })`）。`key` を日本時間の日付にする | クリアまでの手数と時間を、大きいほど良い値に変換 |
| blocks | seed で決まるピースの順番。盤が埋まるまで | 点数 |
| drop | seed で決まるピースの順番。3分のスコア勝負（versus と同じ仕組み） | 点数 |
| n59049 | seed で決まる出現。終わるまで | 点数 |
| water | seed で作る中くらいの難しさのステージ（解けることを確認済み） | `100000 − 手数×100 − 秒`（クリアしたときだけ） |
| parking | seed で作るステージ | water と同じ |
| raft | seed で決まる海。5分でできるだけ遠くへ | versus と同じスコア |
| gates | seed で決まるコースと標準チーム | 点数 |
| hole | 日付で街を決めて2分のソロ | のみこみ率×100 |

- ネジほどきの移行：`nejihodoki3d.daily`（キーは YYYYMMDD、値は星）はそのまま読み、`kobo.daily` にも書きます。日付のキーの形が同じなので、引き継ぎで変えるものはありません。

## 7. ランキング（Firestore）

### 7.1 採用する方式：1人1件の文書＋上位だけ読むクエリ
```
kbBoards/{board}/e/{uid} = { u: uid, n: ニックネーム, s: 値（int、大きいほど良い）, t: serverTime, m?: { dur, seed, v, rp } }
kbBoards/{board}/r/{uid} = { d: リプレイの文字列（最大20KB）, t, v }        // 検証できるゲームの上位だけ
board = "<gameId>~all" | "<gameId>~w<週番号>" | "<gameId>~d<YYYYMMDD>" | "<gameId>~c<YYYYMMDD>"（c = デイリーチャレンジ）
週番号 = floor((ms + 9h + 3日) / 7日)   // 日本時間の月曜0時に切り替わる、1970年からの通し番号
```
- **読むとき**：`orderBy('s','desc').limit(30)`。もっと見るときは `startAfter` で次の30件。結果は localStorage に5分間キャッシュします（`kobo.rankCache`）。自分の順位は、読んだ範囲になければ「30位以下」と自分の記録を出します（count の集計クエリは list のルールで制限しにくいので使いません）。
- **書くとき**：`best` か、`play_end` で、そのボードでの自分の記録（`kobo.rankSent[board]`）を超えたときだけ書きます。1回のプレイで書くのは最大3件（all/w/d、デイリーなら c）。キャッシュしてある30位の値に届かない週間と日間の記録は書きません（通算は必ず書きます）。
- **この方式にした理由**：
  - 期間ごとの「上位N件の配列」を1つの文書にまとめれば読むのは1件で済みます。しかし、クライアントが他人の行も書き換えられてしまい、ルールでは配列の「自分の行だけが変わった」を確かめきれません。さらに、1つの文書への書き込みは毎秒1回ほどが上限で、取り合いになります。サーバーなしでは安全に保てないので採用しません。
  - 1人1件なら、ルールで「本人だけ・型・上限・増えるだけ・送信の間隔・期間が今かどうか」を全部確かめられます。読むのは表示する件数だけです。
- **総合ランキング**：今の「全員を読んで順位点を合計する」方式（ranking:118-131）はやめ、`kbProfiles` の今週の XP（`xpw`）の上位30件を表示します。移行のあいだは「旧総合（〜2026-xx）」のタブで、今の計算を最大1000件の読み取りのまま残します（週に1回まで、キャッシュは1日）。

### 7.2 1日あたりの無料枠の見積もり（1日1,000人が遊ぶと仮定）
| 内容 | 1人あたり | 合計 |
| --- | --- | --- |
| 読む：ホームの抜粋（各ゲームの今週の1位、9件、30分キャッシュ）＋プレイ回数（2件、6時間キャッシュ） | 約15 | 15,000 |
| 読む：ランキングのページ（20%の人が、2タブ×30件） | 12 | 12,000 |
| 読む：nejiUsers の pull（ページを開いたとき、1件） | 約5 | 5,000 |
| **読み取りの合計** | | **約32,000 / 50,000** |
| 書く：nejiUsers の push（30秒以上の間隔で、ページを隠したときにすぐ） | 約4 | 4,000 |
| 書く：ランキング（ベストを更新したときだけ） | 約4 | 4,000 |
| 書く：プレイ回数（1ゲーム1日1回） | 約3 | 3,000 |
| 書く：プロフィール（XP は1日に最大4回） | 約2 | 2,000 |
| **書き込みの合計** | | **約13,000 / 20,000** |
今の作り（監査 R1・R2）では、これより1桁多くなります。ランキングの読み取りを limit とキャッシュに替え、push をまとめることを、Phase 1 で最初に行います。

### 7.3 スコアの信頼性（サーバーなし）
1. **ルール**（8章）：本人だけ、`s` は整数で `0 < s ≤ cap[game]`、更新は増えるときだけ、前の送信から5秒以上、期間のキーが今（境目は15分の猶予）、`t == request.time`。
2. **送る前の確認**（`rank.js`）：`play_start` から `play_end` までの実時間 ≥ `durationMs`。`score / 秒 ≤ maxRate`。デイリーとステージ制のゲームは、その seed とステージで取りうる最大値以下。だめなら送らず、ローカルにだけ残します（`kobo.rankRejected` に理由を記録）。
3. **リプレイ**（決まった乱数で動くゲーム：blocks・n59049・water・parking・neji・drop）：日間・デイリーで上位10位に入ったときだけ、入力の記録（seed＋操作の列を圧縮したもの）を `r/{uid}` に保存します。見る人の端末は上位3件のリプレイを読み、`<game>/engine.js` の `verify(replay)` でもう一度計算します。値が合わない行は「検証できません」として隠します（読むのは最大3件増えるだけ）。
4. **外れ値の除外**（見る側）：`s > cap`、`m.dur` から計算した秒あたりの点が `maxRate` を超える、上位10件の中央値の20倍を超える、のどれかに当てはまる行は灰色にして順位から外します。
5. **管理**：オーナーのアカウントの uid をルールに書き、その uid だけが任意の行を消せるようにします（未決定の質問）。
6. 限界：本気の改ざん（ゲームのコードを改造してリプレイを作る）は防げません。そこまでしたいなら Blaze＋Cloud Functions で、サーバー側でリプレイを検証するしかありません。オーナーの決定によりその道は取りません。

### 7.4 移行
- 初めて新しい `rank.js` が動いたとき、`registry.rankSource` から通算の値を読み、`<game>~all` に送ります（今の `RANK_SOURCES` と同じ計算。例：neji は `maxLevel − 1`）。
- `kusogeRanks/{uid}` は、移行期間中も古いクライアントのために書き込みを許したままにします（値の上限は追加）。新しい `cloud.js` は、ベストが変わったときだけここにも書きます。ランキングのページは `kbBoards` を読みます。移行期間（4週間）が過ぎたら、`kusogeRanks` への書き込みを止めます（ルールで読み取りだけにする）。

## 8. ルールの変更案（全文）

**注意**：そのまま貼り付ける前に、TEST_PLAN.md 6章のルールのテスト（匿名ログインを使った本番での確認）を通すこと。`firebase.json` に firestore と database の設定がないので、ルールはオーナーがコンソールに貼り付けます。上限の値（`caps`）は仮のもので、Phase 1 の作業 P1-4 で実データから決めます。

### 8.1 `firestore.rules`
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isMe(uid) { return signedIn() && request.auth.uid == uid; }
    function isAdmin() { return signedIn() && request.auth.uid in ['OWNER_UID_HERE']; }
    function games() { return ['neji','blocks','drop','raft','gates','n59049','water','parking','hole','hitsumabushi','planet','hitblow','shogi','escape','td','physics']; }
    // 仮の上限（P1-4 で決める）。ゲームを足すときはここにも足す
    function caps() { return { 'neji': 100000, 'blocks': 100000000, 'drop': 100000000, 'raft': 100000,
      'gates': 100000, 'n59049': 1000000000, 'water': 100000, 'parking': 100000, 'hole': 1000000, 'hitsumabushi': 100000, 'planet': 10000, 'hitblow': 10000, 'shogi': 100000, 'escape': 10000, 'td': 1000000, 'physics': 1000 }; }
    function jst(t) { return t + duration.value(9, 'h'); }
    function dayKey(t) { return jst(t).year() * 10000 + jst(t).month() * 100 + jst(t).day(); }
    function weekKey(t) { return math.floor((t.toMillis() + 32400000 + 259200000) / 604800000); }
    function graceT() { return request.time - duration.value(15, 'm'); }
    function okDay(s) { return int(s) in [dayKey(request.time), dayKey(graceT())]; }
    function okWeek(s) { return int(s) in [weekKey(request.time), weekKey(graceT())]; }
    function okPeriod(p) {
      return p == 'all'
        || (p.matches('^d[0-9]{8}$') && okDay(p.replace('^d', '')))
        || (p.matches('^c[0-9]{8}$') && okDay(p.replace('^c', '')))
        || (p.matches('^w[0-9]{1,6}$') && okWeek(p.replace('^w', '')));
    }
    function okBoard(b) { let p = b.split('~'); return p.size() == 2 && p[0] in games() && okPeriod(p[1]); }
    function okName(n) { return n is string && n.size() >= 1 && n.size() <= 12; }
    function okEntry(b) {
      let d = request.resource.data;
      return d.keys().hasAll(['u','n','s','t']) && d.keys().hasOnly(['u','n','s','t','m'])
        && d.u == request.auth.uid && okName(d.n) && d.s is int && d.s > 0 && d.s <= caps()[b.split('~')[0]]
        && d.t == request.time && (!('m' in d) || (d.m is map && d.m.size() <= 8));
    }

    // 自分の記録（本人だけ）。既存の文書の形は変えない（games, updatedAt, level, maxLevel, stars, daily, name）
    match /nejiUsers/{uid} {
      allow read, delete: if isMe(uid);
      allow create, update: if isMe(uid) && (!('games' in request.resource.data) || request.resource.data.games is map);
    }

    // 旧ランキング（移行期間中だけ書ける）。値の上限を追加
    match /kusogeRanks/{uid} {
      allow read: if true;
      allow create, update: if isMe(uid)
        && request.resource.data.keys().hasOnly(['name', 'scores', 'updatedAt'])
        && okName(request.resource.data.name)
        && request.resource.data.scores is map && request.resource.data.scores.size() <= 20
        && request.resource.data.scores.keys().hasOnly(games())
        && request.resource.data.scores.get('neji', 0) <= caps()['neji']
        && request.resource.data.scores.get('blocks', 0) <= caps()['blocks']
        && request.resource.data.scores.get('drop', 0) <= caps()['drop']
        && request.resource.data.scores.get('raft', 0) <= caps()['raft']
        && request.resource.data.scores.get('gates', 0) <= caps()['gates']
        && request.resource.data.scores.get('n59049', 0) <= caps()['n59049']
        && request.resource.data.scores.get('water', 0) <= caps()['water']
        && request.resource.data.scores.get('parking', 0) <= caps()['parking']
        && request.resource.data.scores.get('hole', 0) <= caps()['hole'];
      allow delete: if isMe(uid) || isAdmin();
    }

    // 新しいランキング：1人1件
    match /kbBoards/{board}/e/{uid} {
      allow get: if true;
      allow list: if request.query.limit <= 50;
      allow create: if isMe(uid) && okBoard(board) && okEntry(board);
      allow update: if isMe(uid) && okBoard(board) && okEntry(board)
        && request.resource.data.s > resource.data.s
        && request.time > resource.data.t + duration.value(5, 's');
      allow delete: if isMe(uid) || isAdmin();
    }
    // リプレイ（上位の検証用）
    match /kbBoards/{board}/r/{uid} {
      allow get: if true;
      allow list: if false;
      allow create, update: if isMe(uid) && okBoard(board)
        && request.resource.data.keys().hasOnly(['d', 't', 'v'])
        && request.resource.data.d is string && request.resource.data.d.size() <= 20000
        && request.resource.data.t == request.time;
      allow delete: if isMe(uid) || isAdmin();
    }

    // 公開プロフィール（ランキングとフレンドの表示用）
    match /kbProfiles/{uid} {
      allow get: if true;
      allow list: if request.query.limit <= 50;
      allow create, update: if isMe(uid)
        && request.resource.data.keys().hasOnly(['n', 'icon', 'title', 'lv', 'xpw', 'wk', 'code', 't'])
        && okName(request.resource.data.n)
        && request.resource.data.icon is string && request.resource.data.icon.size() <= 16
        && request.resource.data.title is string && request.resource.data.title.size() <= 24
        && request.resource.data.lv is int && request.resource.data.lv >= 1 && request.resource.data.lv <= 999
        && request.resource.data.xpw is int && request.resource.data.xpw >= 0 && request.resource.data.xpw <= 12000
        && request.resource.data.wk == weekKey(request.time)
        && request.resource.data.t == request.time
        && (resource == null || request.time > resource.data.t + duration.value(60, 's'));
      allow delete: if isMe(uid) || isAdmin();
    }

    // フレンドコード → uid（読めるのは1件ずつだけ。一覧はできない）
    match /kbCodes/{code} {
      allow get: if true;
      allow list: if false;
      allow create: if signedIn() && code.matches('^[2-9A-HJ-NP-Z]{8}$')
        && request.resource.data.keys().hasOnly(['u', 't'])
        && request.resource.data.u == request.auth.uid && request.resource.data.t == request.time;
      allow delete: if signedIn() && resource.data.u == request.auth.uid;
    }

    // 匿名のプレイ回数：1週間に1件、ゲームごとに1つずつ増やすだけ
    function prevPlays() { return resource == null ? {} : resource.data; }
    function plus1(g) {
      return request.resource.data.get(g, 0) == prevPlays().get(g, 0)
          || request.resource.data.get(g, 0) == prevPlays().get(g, 0) + 1;
    }
    match /kbPlays/{week} {
      allow get: if true;
      allow list: if false;
      allow create, update: if signedIn() && week == 'w' + string(weekKey(request.time))
        && request.resource.data.keys().hasOnly(games())
        && request.resource.data.diff(prevPlays()).affectedKeys().size() == 1
        && plus1('neji') && plus1('blocks') && plus1('drop') && plus1('raft') && plus1('gates')
        && plus1('n59049') && plus1('water') && plus1('parking') && plus1('hole');
    }
  }
}
```
補足：
- `nejiUsers` には、キーの許可リストを付けていません。昔のバージョンが書いた、知らないフィールドが残っているかもしれず、`hasOnly` にすると更新が全部失敗するおそれがあるからです。P1-4 で、本番の自分の文書を読んで確かめてから付けるかを決めます。
- 新しいゲームを足すときは、`games()`・`caps()`・`plus1()` の3か所を直します（レジストリから生成する小さなスクリプトを `tools/` に置く。B）。

### 8.2 `database.rules.json`
```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "vs": {
      "queue": {
        "$game": {
          ".read": "auth != null",
          "$uid": {
            ".write": "auth != null && auth.uid === $uid",
            ".validate": "newData.hasChildren(['n', 't'])",
            "n": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12" },
            "t": { ".validate": "newData.isNumber()" },
            "h": { ".validate": "newData.isNumber()" },
            "r": { ".validate": "newData.isString() && newData.val().length <= 40" },
            "m": { "$i": { ".validate": "$i.matches(/^[0-3]$/) && newData.isString()" } },
            "$other": { ".validate": false }
          }
        }
      },
      "rooms": {
        "$room": {
          ".read": "auth != null",
          ".write": "auth != null && ((!data.exists() && newData.child('h').val() === auth.uid) || (!newData.exists() && (data.child('h').val() === auth.uid || data.child('m').child(auth.uid).exists() || data.child('at').val() < now - 600000)))",
          "m": { "$uid": { ".write": "auth != null && auth.uid === $uid" } },
          "go": { ".write": "auth != null && !data.exists() && data.parent().child('h').val() === auth.uid" },
          "s": { "$uid": { ".write": "auth != null && auth.uid === $uid", ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000000" } },
          "f": { "$uid": { ".write": "auth != null && auth.uid === $uid", ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000000" } },
          "res": { ".write": "auth != null && !data.exists() && data.parent().child('m').child(auth.uid).exists()" }
        }
      }
    },
    "hole": {
      "queue": {
        ".read": "auth != null",
        "$uid": {
          ".write": "auth != null && auth.uid === $uid",
          "n": { ".validate": "newData.isString() && newData.val().length <= 12" }
        }
      },
      "rooms": {
        "$room": {
          ".read": "auth != null",
          ".write": "auth != null && ((!data.exists() && newData.child('h').val() === auth.uid) || (!newData.exists() && (data.child('h').val() === auth.uid || data.child('m').child(auth.uid).exists() || data.child('at').val() < now - 600000)))",
          "m": { "$uid": { ".write": "auth != null && auth.uid === $uid" } },
          "g": { ".write": "auth != null && data.parent().child('m').child(auth.uid).exists()" },
          "p": { "$pid": { ".write": "auth != null && ($pid === auth.uid || data.parent().parent().child('m').child(auth.uid).exists())" } },
          "o": { "$gi": { ".write": "auth != null && data.parent().parent().child('m').child(auth.uid).exists()" } },
          "k": { "$kid": { ".write": "auth != null && data.parent().parent().child('m').child(auth.uid).exists()" } }
        }
      }
    }
  }
}
```
- 書き込みの洗い出しのもと：versus.js:449-621（`qref.set/update`、`rooms.push().set`、`m/{uid}`、`go`、`s/{uid}`、`f/{uid}`、`res`、`rref.remove`）、hole:1802-2116（`qref`、`rooms.push().set`、`m`、`g`、`p`、`o/{gi}` transaction、`k.push`、`rref.remove`）。いま対戦を組み込んでいる作業者が書き込み先を増やしたら、このルールにも足すこと。
- 部屋を作ったあとに自分の行 `m/{uid}` を書く順番は、今のコードのとおりです（作る → 入る）。`$room` の `.write` で「作るときは `h` が自分」と決め、子の行は本人だけに書かせます。
- 残った部屋の掃除（R13）：10分以上たった部屋は、だれでも削除できます（`at < now − 600000`）。クライアントは部屋の一覧を読めないので、待ち行列の `r` に書かれた部屋 ID を見て、古ければ消します（versus.js の `requeue` のときに行う）。

## 9. プロフィール・履歴・お気に入りの保存（端末を先に、あとから同期）

| キー | 中身 | 同期のマージ |
| --- | --- | --- |
| `kobo.nick`（既存） | ニックネーム | newest |
| `kobo.profile` | `{ v:1, icon, title, created }` | newest（フィールドごと） |
| `kobo.history` | `[{ g, t, d, s, m }]` 最新50件 | 和集合（g と t で重複を除く）、新しい順に50件 |
| `kobo.fav` | `{ gameId: +時刻（登録） / −時刻（解除） }` | キーごとに絶対値の大きい方 |
| `kobo.stats` | `{ <devId>: { gameId: { plays, ms, clears } } }` | 端末とゲームとフィールドごとに大きい方 |
| `kobo.xp` | 4.4 | 4.4 |
| `kobo.ach` | `{ id: 時刻 }` | 和集合、時刻は早い方 |
| `kobo.daily` | 6章 | フィールドごと |
| `kobo.friends` | `{ uid: { n, code, at } }`、最大30人 | 和集合（解除はトゥームストーン） |
| `kobo.audio` | 11章 | newest |
| `kobo.theme` | `'system' | 'light' | 'dark'` | newest |
| `kobo.news.read` | 最後に読んだお知らせの ID | max |
| `kobo.dev`・`kobo.rankSent`・`kobo.rankCache`・`kobo.mtime`・`kobo.syncedUid` | 端末だけのもの | 同期しない |

**cloud.js の拡張**（後方互換のまま）：
- `KoboCloud.sync({ key: 'max' | 'newest' | { merge(localStr, remoteStr) → str } })`。関数のマージは `platform.js` に入れます。`'newest'` のキーにも、レジストリでフィールドごとのマージを登録できるようにします（R4 の対策。例：`water.save` は `level/best` は大きい方、`stars` はキーごとに大きい方）。
- `removeItem` も上書きして、トゥームストーン `{ v: null, t }` を同期します（R3 の対策）。
- push は最短でも30秒の間隔にまとめ、`visibilitychange:hidden` と `pagehide` のときにすぐ送ります。値が同じなら送りません。`submitScores`（旧ランキング）は内容が変わったときだけ送ります（R2 の対策）。
- `reloadOnNewer` は `KoboGame.isIdle()` が true のときだけ再読み込みします。遊んでいる最中なら、「別の端末の進行があります（再読み込み）」というトーストを出します（R14 の対策）。
- 認証：`KoboCloud.user()` は `{ uid, isAnonymous, name }` を返します。`ensureGuest()` は、ランキングへの送信やプレイ回数の記録が必要になったときに初めて、既定のアプリで匿名ログインします。`linkGoogle()` は `linkWithPopup` で匿名アカウントを Google につなぎ、uid はそのままです。`auth/credential-already-in-use` のときは Google でログインし直し、端末のデータをマージで送ります。
- ゲストの `nejiUsers` への同期はしません（書き込みを節約するため）。Google につないだときから同期します。
- `cloud.js` の UI の文字は `KoboI18n.t()` を通します（index.html:318-342 の翻訳の仕掛けは、そのあとで消します）。
- ネジほどきの独自の同期（neji:1586-1650）は、Phase 2 の neji の作業で `cloud.js` に移します。`nejiUsers` のトップレベルのフィールドは今までどおり書き続けます（古いページを使う人のため）。

## 10. テーマ（`common/theme.css`）

```css
:root, [data-kb-theme="dark"] { --kb-bg:#1d2a35; --kb-surface:#263744; --kb-surface-2:#2f4352; --kb-line:#3a4f5f;
  --kb-ink:#eef2f4; --kb-dim:#9fb1bd; --kb-accent:#f2b33d; --kb-accent-ink:#2b1d05; --kb-danger:#ff6b6b; --kb-ok:#4cc38a;
  --kb-shadow:0 8px 24px rgba(0,0,0,.4); --kb-radius:16px; --kb-font-display:"Dela Gothic One",…; --kb-font-body:"M PLUS Rounded 1c",…; color-scheme:dark; }
[data-kb-theme="light"] { --kb-bg:#f4f1ea; --kb-surface:#ffffff; --kb-surface-2:#ece7dc; --kb-line:#d6cfc2; --kb-ink:#1f2a33;
  --kb-dim:#5b6873; --kb-accent:#c98a10; --kb-accent-ink:#ffffff; … color-scheme:light; }
```
- 今のハブの色（index.html:79-84 の `--steel` など）が、ダークの初期値です。見た目は変わりません。
- `platform.js` が `<head>` で `kobo.theme` と `prefers-color-scheme` から `html[data-kb-theme]` を決めます。`theme-color` の meta も書き換えます。
- ゲームは、**UI の部分**（上のバー、オーバーレイ、ボタン、カード）でトークンを使います。盤面や 3D の色はゲームのデザインのままでかまいません。そのうえでコントラスト比 4.5 を守ります。`versus.js` の `theme` にもトークンを渡せるようにします（`var(--kb-accent)`）。

## 11. 音の設定（`common/audio.js`）

```js
kobo.audio = { v:1, master: 0.8, se: 1.0, bgm: 0.6 /* 予約。UI には出さない */, mute: false }
KoboAudio.ctx()                 // ユーザーが操作したときに作り、解除する共通の AudioContext
KoboAudio.se                    // 効果音のバス（GainNode）。ゲームは beep を se につなぐ
KoboAudio.bgm                   // 予約。BGM を入れるまでは使わない（オーナーの決定 7）
KoboAudio.onChange(f)           // 設定が変わったとき（ほかのタブで変えたときは storage イベント）
```
- 移行：`kobo.audio` がなければ、`kusoge.sound === '0'` または `nejihodoki3d.sound === false` から `mute:true` を作ります。移行期間中は `kusoge.sound` にも書き続けます（まだ対応していないページのため）。
- 設定の画面：ハブの設定シートとゲームの共通メニューに、「全体の音量」「効果音」「ミュート」の3つを出します。BGM の行は `hidden` で用意しておきます。

## 12. 移行の計画（今のキー → これから）

| 今のキー | 使っている場所 | これから |
| --- | --- | --- |
| `nejihodoki3d.{level,maxLevel,stars,daily,seenHelp}` | neji | そのまま使う。`maxLevel` と `stars` と `daily` を `cloud.js` で同期する（max と、キーごとに大きい方） |
| `nejihodoki3d.sound` | neji | 読むだけにする → `kobo.audio` |
| `kusoge.sound` | 全ゲーム、ハブ | 読む＋書く（移行期間）→ `kobo.audio` |
| `kusoge.<game>.best` | blocks, drop, raft, n59049 | そのまま（max） |
| `kusoge.<game>.state / save` | 各ゲーム | そのまま。マージをフィールドごとにし、削除はトゥームストーンで同期する |
| `kusoge.n59049.bestTile` | n59049 | 同期の対象に足す（max） |
| `kusoge.vs.stats` | versus.js | そのまま（newest → ゲームごとのフィールドのマージ） |
| `kobo.nick` / `kobo.lang` / `kobo.mtime` / `kobo.syncedUid` | 共通 | そのまま |
| Firestore `nejiUsers/{uid}.games` | cloud.js | そのまま。新しい `kobo.*` のキーも同じ map に入れる |
| Firestore `nejiUsers/{uid}` のトップレベル | neji | そのまま（読み書きを続ける） |
| Firestore `kusogeRanks/{uid}` | ランキング | 4週間はそのまま → `kbBoards/*~all` に移す → 読み取りだけにする |
| RTDB `hole/*`、`vs/*` | 対戦 | パスはそのまま。ルールだけを厳しくする |

移行のコードは `platform.js` の `MIGRATIONS = [{ id: 'audio-1', run() {} }, …]` に並べます。終わったものは `kobo.migrated = { id: 時刻 }` に記録し、1回だけ実行します。古いキーは消しません。

## 13. ホスティングと SW
- `firebase.json` の `ignore` に `docs/**` と `tools/**` を足します（P1-6）。GitHub Pages ではリポジトリ全体が見えることに注意します（秘密の値は入れない）。
- `sw.js`：`importScripts('common/games.js')` から `GAMES` と、サムネイルの一覧を作ります。`common/*.js` と `theme.css` を `CORE` に足します。`VERSION` は、レジストリの `version` を使います（上げ忘れを防ぐ）。
- GitHub Pages：`gh-pages` への push を GitHub Actions で自動にします（R25。workflow に job を足す）。

## 14. お知らせ・フレンド・ステージの共有（Phase 3〜4）
- **お知らせ**：`common/news.json` は `[{ id, date, title:{ja,en}, body:{ja,en}, link? }]`。ハブで未読のバッジを出し、`kobo.news.read` で既読を管理します。プッシュ通知はしません。
- **フレンド**：Google ログインのユーザーは、プロフィールを作ったときに `kbCodes/{8文字}` を作ります。相手のコードを入れると、`get` で uid を調べ、`kobo.friends` に足します（一方向）。フレンドのランキングは `kbBoards/{board}/e` を `where('u', 'in', [最大30人])` で読みます（読み取りは人数ぶん）。
- **ステージの共有コード**：ステージの JSON → deflate（`CompressionStream`）→ base64url → 先頭に `game:v1:`、末尾にチェックサム。URL では `?code=` で受け渡します。解けるかどうかは、受け取った側でゲームのソルバーを使って確かめてから遊ばせます。サーバーには置きません。
