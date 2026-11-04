# 開発ロードマップ

決まりごと：
- 1つの作業は、ほかの作業と**同じファイルを触らない**ようにしています（「担当ファイル」以外は変えない）。どうしても必要なときは、担当している作業者に頼みます。
- 共通のファイルのうち、ぶつかりやすいもの（`sw.js`、`index.html`、`common/i18n.js`、`firestore.rules`、`database.rules.json`）は、各フェーズで担当者を1人に決めています。
- どの作業も、終わったら `tools/tests/run.js` の該当するテストが通ること、CLAUDE_CODE_MASTER_PROMPT.md の完了報告を出すことを完了の条件とします。
- いまの対戦を組み込む作業（n59049, water, parking, neji, gates, raft）が `main` に入るまで、そのゲームのファイルには Phase 2 の作業を始めません。

## Phase 1：土台（データを守り、無料枠に収め、共通の層を用意する）

| ID | 作業 | 担当ファイル（これ以外は触らない） | 先に終わっている必要があるもの | 完了の条件 |
| --- | --- | --- | --- | --- |
| P1-1 | テストの土台 | `tools/tests/**`（新規。ただし `tools/tests/rules/**` は P1-4 の担当） | なし | TEST_PLAN.md の `run.js`、`lib/*`、全ページのスモークテスト、画面サイズのテスト、サムネイルを作る `tools/tests/shots.js` が動く。今の main で実行して、結果（落ちるものも含む）を報告する |
| P1-2 | レジストリと platform の中心 | `common/games.js`、`common/platform.js`、`common/game.js`（いずれも新規） | なし | 9本のゲームの登録が `index.html` と同じ内容。`jstDateKey`・`rng`・`hash32` の単体テスト（日本時間の境目、DST のない国とある国）。イベントバス、履歴、お気に入り、統計、移行の仕組み。どのページもまだ読み込まない（読み込むのは P1-7 以降） |
| P1-3 | 音とテーマ | `common/audio.js`、`common/theme.css`、`common/ui.css`、`common/ui.js`、`tools/ui-demo/**`（いずれも新規） | なし | `kusoge.sound` と `nejihodoki3d.sound` からの移行。ライトとダーク。部品のデモページ `tools/ui-demo/index.html`（新規。P1-3 の担当）で、全サイズのスクリーンショット |
| P1-4 | ルール | `firestore.rules`、`database.rules.json`、`tools/tests/rules/**` | P1-1 | SYSTEM_ARCHITECTURE.md 8章をもとに、上限の値を実データから決める。versus.js と hole の書き込みを全部洗い出して、許可と拒否のテストを書く。**オーナーが貼り付ける手順書**を、作業の報告に入れる。古いクライアントがそのまま動くことを確かめる |
| P1-5 | 同期の強化 | `common/cloud.js` | P1-2 | マージの種類（関数）、`removeItem` のトゥームストーン、push を30秒にまとめる、変わったときだけ送るランキング、`isIdle` を見てから再読み込み、`ensureGuest`・`linkGoogle`、UI の文字を i18n に。監査の R2・R3・R4・R14 の回帰テストが通る。既存の `KoboCloud.sync({key:'max'})` の呼び方はそのまま動く |
| P1-6 | 新しいランキング | `common/rank.js`（新規）、`ranking/index.html` | P1-2、P1-4、P1-5 | 通算・週間・日間のタブ、30件ずつ、5分のキャッシュ、外れ値を灰色にする、`kusogeRanks` からの移行、旧総合のタブ。1回表示したときの読み取りが60件以下であることをテストで確かめる |
| P1-7 | ハブ v2 | `index.html`、`manifest.webmanifest`、`sw.js`、`firebase.json`、`img/**`（新規）、`about/index.html`（新規）、`common/i18n.js`（`fitViewport` をレジストリから読むところだけ）、`.github/workflows/*`（gh-pages の自動化） | P1-2、P1-3、P1-5、P1-6 | ヘッダー（検索・プロフィール）、ヒーロー、続きから、今日のチャレンジ（デイリーがあるゲームだけ。ないときは欄ごと出さない）、人気（データがないときは出さない）、新着、ジャンル、ランキングの抜粋、フッター（規約・GitHub Issues）。スクリーンショットは `tools/tests/shots.js` で作る。ライトとダーク。今の記録の表示（R9 を直す）。`docs/**` と `tools/**` を公開から外す |

順番と並行して進められるもの：
```
P1-1 ─┬─────────────► P1-4 ─┐
P1-2 ─┼─► P1-5 ────────────┼─► P1-6 ─► P1-7
P1-3 ─┘                    │
```
P1-1・P1-2・P1-3 は同時に始められます。P1-4 と P1-5 も同時に進められます。

## Phase 2：ゲームを1本ずつ基準に合わせる

1本のゲームにつき1つの作業で、担当は `<game>/**` だけです（`common/` は触らない。足りないものは Phase 1 の担当に頼む）。
共通の内容：`common/` を読み込む、`KoboGame.register`、イベント、`KoboAudio`、テーマのトークン（UI の部分だけ）、`__kb` のフック、GAME_QUALITY_STANDARDS.md の全項目、デイリー（`flags.daily`）、レジストリの `sync` に書いたマージ関数に合わせた保存の確認。

| ID | ゲーム | 担当ファイル | 主な中身（監査より） | 先に必要 |
| --- | --- | --- | --- | --- |
| P2-neji | neji | `neji/**` | 独自の同期を `cloud.js` に移す（R8、`nejiUsers` のトップレベルは書き続ける）、日本時間のデイリー（R7）、音（R6）、止まっているときは描画しない・影の画質（R16） | Phase 1、対戦の作業が main に入っていること |
| P2-blocks | blocks | `blocks/**` | 遊び方とチュートリアル、終わった盤の復活（R3 の確認）、デイリー | Phase 1 |
| P2-drop | drop | `drop/**` | 途中の盤の保存 `kusoge.drop.state`、デイリー | Phase 1 |
| P2-raft | raft | `raft/**` | 保存の回数（R2。端末への保存は4秒のままでよく、同期は P1-5 がまとめる）、死んだあとの復活（R3）、自動の画質調整 | Phase 1、対戦の作業 |
| P2-gates | gates | `gates/**` | `gates.save` のマージ関数（R4。コイン・素材は newest、最高ステージは max）、最初のステージをチュートリアルに | Phase 1、対戦の作業 |
| P2-n59049 | n59049 | `n59049/**` | 遊び方、`bestTile` の同期、デイリー | Phase 1、対戦の作業 |
| P2-water | water | `water/**`、`water/engine.js`（新規） | マージ関数、デイリー、エンジンを分けてリプレイの検証に使う | Phase 1、対戦の作業 |
| P2-parking | parking | `parking/**`、`parking/engine.js`（新規） | 遊び方の画面、マージ関数、デイリー | Phase 1、対戦の作業 |
| P2-hole | hole | `hole/**` | ランキングの値（R10。`best.matchPts` → 最高点のフィールドを足す）、マージ関数、部屋の掃除（R13）、送る回数を減らす（R12。10Hz → 5Hz＋補間）、新しい RTDB のルールで動くこと | Phase 1（とくに P1-4） |

マージ関数とランキングの値の定義は、`common/games.js` に書きます。Phase 2 の作業者が直したい場合は、P1-2 の担当（またはその作業を引き継いだ人）に頼みます。担当者を1人に決めておくための決まりです。

完了の条件（どのゲームも）：GAME_QUALITY_STANDARDS.md の表で全部 ✓（BGM は除く）。`tools/tests/run.js --game <id>` がすべて通る。古い形の保存を読み込めること（fixtures）。

## Phase 3：プレイヤーの仕組み

| ID | 作業 | 担当ファイル | 先に必要 | 完了の条件 |
| --- | --- | --- | --- | --- |
| P3-1 | XP・ランク・称号 | `common/platform.js`（XP の部分）、`common/achievements.js`（新規） | Phase 2 の2本以上 | 4章の計算と上限の単体テスト。複数の端末でのマージのテスト。`kbProfiles` への書き込みは1日4回まで |
| P3-2 | プロフィールのページ | `profile/index.html`（新規） | P3-1 | ニックネーム、アイコン、称号、統計、実績の一覧、履歴、データの削除（P-8） |
| P3-3 | 実績の定義 | `common/achievements.js`、レジストリの `achievements` | P3-1 | 全体で15個以上、各ゲーム5個以上。さかのぼって判定するテスト |
| P3-4 | 総合ランキング（XP） | `ranking/index.html`、`common/rank.js` | P3-1 | 今週の XP の上位30件。旧総合のタブを片付ける |
| P3-5 | フレンド | `common/friends.js`（新規）、`profile/index.html` | P3-2 | コードを作る・入れる・外す。フレンドのランキング |
| P3-6 | お知らせ | `common/news.json`、`index.html`（お知らせの部分だけ） | P1-7 | 未読のバッジ、英語の文 |
| P3-7 | 対戦の匿名アカウントを1つにまとめる | `common/versus.js` | P1-5 | `kobo-vs` の別アプリをやめ、既定のアプリの匿名ログインを使う。古い uid での RTDB の書き込みが残っていても問題ないこと |

## Phase 4：新しいゲームと仕上げ

| ID | 作業 | 担当ファイル | 完了の条件 |
| --- | --- | --- | --- |
| P4-1 | 脱出ゲーム | `escape/**`、レジストリに1件足す、`firestore.rules` の `games()`・`caps()`・`plus1()` | GAME_QUALITY_STANDARDS.md の全項目。部屋のヒントを3段階で。商用の作品に似せない |
| P4-2 | タワーディフェンス | `td/**` | 同上 |
| P4-3 | 物理パズル | `physics/**`（物理エンジンは自作か、cdnjs のバージョン固定のもの） | 同上。物理の結果が端末で変わらないこと（固定の時間刻み） |
| P4-4 | ミニゴルフ | `golf/**` | 同上 |
| P4-5 | リズム | `rhythm/**` | オーナーが曲を用意してから。それまでは始めない |
| P4-6 | ステージエディタ | 対象のゲーム（最初は water か parking）の `<game>/**` | 共有コードだけ（SYSTEM_ARCHITECTURE.md 14章）。ソルバーで解けることを確かめてから共有できる |
| P4-7 | PWA の仕上げ | `manifest.webmanifest`、`sw.js` | `id`、`screenshots`、`shortcuts`、更新のお知らせ |
| P4-8 | 負荷テスト | `tools/load/**`（新規） | RTDB に同時に100接続、部屋を20個。Firestore の1日の読み書きを実際に計測して、7.2 の見積もりと比べる |
| P4-9 | BGM | `common/audio.js`、各ゲーム | オーナーが曲を用意してから |

新しいゲームを足すときに必ず直すところ：`common/games.js`、`firestore.rules`（3か所）、サムネイル（`tools/tests/shots.js` で作る）。`sw.js`・`i18n.js`・ハブ・ランキングは、レジストリから自動で反映されます（P1-7 のあと）。
