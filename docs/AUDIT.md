# 現状監査（Phase 0）

対象：2026-11-04 時点の作業ツリー（`main` の e6869cf と、作業中の変更を含む）。
方法：コードを読んだだけです（実機・Playwright での再現はしていません）。✓/△/✗ はコードから読み取れた範囲の判定です。「要確認」は実際に遊んで確かめる必要があるものです。
注意：`n59049 / water / parking / neji / gates / raft` は、別の作業者がオンライン対戦を組み込んでいる最中です。行番号はずれることがあります。

---

## 1. システム別の現状

| システム | いまあるもの | 足りないもの |
| --- | --- | --- |
| ゲームホーム | `index.html`：縦一列のゲームカード（SVG アイコン）、各ゲームの自己ベスト表示（`refreshRecords()` index.html:293-305）、言語、サウンド ON/OFF、ログイン欄、PWA インストール案内 | 検索・おすすめ・続きから・今日のチャレンジ・人気・新着・ジャンル・ランキングの抜粋・規約やお問い合わせのフッター・ライトテーマ・実際の画面のスクリーンショット |
| ゲームエンジン層 | `common/i18n.js`（翻訳と `fitViewport` index.html の高さ合わせ）、`common/versus.js`（共通オンライン対戦）、`common/cloud.js`（同期） | 共通のゲームの約束事（init/pause/resume/dispose）、共通イベント、共通UI部品、共通オーディオ。各ゲームが store、効果音、トースト、オーバーレイをそれぞれ自前で持っている |
| ランキング | `ranking/index.html`：`kusogeRanks` を最大1000件読み、ゲーム別と総合（順位点の合計）をクライアント側で計算 | 週間・日間・デイリーチャレンジのランキング、実績、スコアの妥当性チェック、件数が増えても読み取り回数が増えない仕組み |
| プレイヤー | Google ログイン（`cloud.js` の `login()`）、ニックネーム（`kobo.nick`）、ゲームごとの対戦成績（`kusoge.vs.stats`） | ゲスト（匿名）プロフィール、プレイ履歴、お気に入り、XP とランク、称号、プロフィール画面 |
| チャレンジ | ネジほどきだけ「今日のチャレンジ」がある（neji/index.html:1127-1132）。ただし日付は端末の現地時間 | 全ゲームのデイリー、日本時間での日付切り替え、チャレンジ専用のランキング |
| データ基盤 | localStorage（`kusoge.<game>.*`、`nejihodoki3d.*`、`kobo.*`）、Firestore `nejiUsers/{uid}.games` への同期（'max' と 'newest' の2種類）、RTDB `hole/*` と `vs/*` | フィールドごとのマージ、削除の同期、書き込み回数の抑制、データ形式のバージョン、移行の仕組み |

### 共通ファイルのまとめ
- `common/cloud.js`（204行）：`Storage.prototype.setItem` を上書きして、対象のキーが変わったら1.5秒後に push、2.5秒後にランキングを送信（cloud.js:27-36）。マージは `better()`（cloud.js:65-69）。同期に使うのは https のときだけ（cloud.js:44）。
- `common/i18n.js`（91行）：辞書・`t()`・`picker()`・`fitViewport()`。対象ゲームの一覧が正規表現で直書きされている（i18n.js:59）。
- `common/versus.js`（674行）：RTDB の待ち行列と部屋、同じ seed での時間制スコア勝負。匿名ログインは別の Firebase アプリ `kobo-vs` で行う（versus.js:283-289）ので、ハブのログイン状態には影響しない。
- `sw.js`：通信を優先し、だめなら保存分を使う。`VERSION` は手で上げる。`GAMES` 一覧も直書き（sw.js:5）。
- `firestore.rules`：`nejiUsers`（本人だけ読み書き、形の検証なし）と `kusogeRanks`（だれでも読める。値の検証はない）。
- `database.rules.json`：`hole/rooms/$room` と `vs/rooms/$room` は、ログインしていればだれでも丸ごと書ける。

---

## 2. ゲーム別の現状

| ゲーム | 方式 | 行数 | 保存キー | 同期 | 対戦 | メモ |
| --- | --- | --- | --- | --- | --- | --- |
| neji ネジほどき 3D | Three.js（影あり、MeshStandard） | 1893 | `nejihodoki3d.{level,maxLevel,stars,daily,sound,seenHelp}` | **独自実装**（neji:1586-1650。`cloud.js` は読み込まない） | あり（作業中） | 解ける問題を自動で作る。7段階の難易度。引き継ぎコード。デイリーあり |
| blocks ブロックはめ | Canvas 2D | 819 | `kusoge.blocks.{best,state}` | max / newest＋自動再読み込み | あり | 遊び方の説明がない |
| drop おちものタワー | Canvas 2D | 966 | `kusoge.drop.best` | max | あり | 途中の盤を保存しない。一時停止あり |
| raft いかだ暮らし | Three.js（Lambert） | 2997 | `kusoge.raft.{best,save,seen3}` | max / newest＋自動再読み込み | あり（作業中） | 4秒ごとに状態をまるごと保存 |
| gates ゲートランナー | Three.js（インスタンス描画） | 2241 | `kusoge.gates.save`（v2、旧2D版から移行する `migrate()` gates:444） | newest＋自動再読み込み | あり（作業中） | 育成（拠点・ヒーロー） |
| n59049 | Three.js（Phong） | 814 | `kusoge.n59049.{best,bestTile,state}` | best=max、state=newest（`bestTile` は同期されない） | あり（作業中） | 変化があるときだけ描画する（n59049:735-744） |
| water いろみず分け | Canvas 2D | 1206 | `kusoge.water.save` `{level,best,stars}` | newest＋自動再読み込み | あり（作業中） | 解けることを確かめたステージ。ヒントと試験管の追加 |
| parking くるま出し | Three.js（Lambert） | 1422 | `kusoge.parking.save` `{level,best,stars}` | newest＋自動再読み込み | あり（作業中） | 1手戻す・ヒント |
| hole あなぼこシティ | Three.js（Lambert、ステンシル） | 2206＋`cities.js` 1142 | `kusoge.hole.save`（best/coins/skins/perks/camp/online/city） | newest＋自動再読み込み | **独自の RTDB 対戦**（hole:1770-2120、`versus.js` は使わない） | fps を測って pixel ratio を自動で下げる（hole:2157） |

---

## 3. 公開できる品質かどうか（ゲーム × 条件）

凡例：✓ 満たしている／△ 一部だけ・要確認／✗ ない／— このゲームには不要
BGM はオーナーの判断で「あとで」なので、この表では判定しません（後述）。

| 条件 | neji | blocks | drop | raft | gates | n59049 | water | parking | hole |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 初めてでもわかる | ✓ 初回にヘルプを表示（neji:1801） | ✗ 説明なし | ✓ スタート画面に操作の一覧 | ✓ 初回に遊び方（`showHowto` raft:2821） | △ 途中で出るヒントだけ | △ 1行ヒント（`#hint`） | ✓ あそびかた（`ovHelp`） | △ ヒントボタンだけ。要確認 | ✓ タイトルに操作の説明 |
| チュートリアル | △ 文章だけ | ✗ | △ 文章だけ | △ | △ | ✗ | △ | ✗ | △ |
| スマホで操作しやすい | ✓ | ✓ ドラッグ | ✓ ボタンとジェスチャー | 要確認 | ✓ | △ 2本指で視点を回すのは見つけにくい | ✓ | 要確認 | ✓ |
| ゲームオーバー後にやり直せる | ✓ | ✓ | ✓ | ✓ | ✓ `btnRetry` | ✓（＋1手戻す） | ✓ | ✓ | ✓ |
| 一時停止と再開 | — 手番制 | — 手番制 | ✓ 画面を離れると止まる（drop:896） | ✓ 画面を離れると止まる（raft:2892） | ✓（gates:2066） | — | — | — | ✓（hole:1621） |
| 保存が正しい | △ 独自の同期。ランキングは他のページで送られる | △ 終わった盤が復活する（R3） | △ 途中の盤を保存しない | △ 書き込みが多い（R2）、終わった回が復活する（R3） | △ newest で丸ごと上書き（R4） | △ `bestTile` が同期されない | △ R4 | △ R4 | △ R4（コインやスキンが消えることがある） |
| 難易度の調整 | ✓ 実測して7段階 | △ 乱数まかせ | △ 要確認 | 要確認 | 要確認 | — | ✓ 解けることを確認 | ✓ | △ ライバル Lv |
| 効果音 | ✓（共通キーを使わない R6） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 音量の設定 | ✗ ON/OFF だけ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| クリアしたときの気持ちよさ | ✓ 紙吹雪 | ✓ コンボ | ✓ そろい消し | △ | ✓ | ✓ 59049 到達 | ✓ | ✓ 星 | ✓ 結果画面 |
| 不具合がないことを確かめた | △ | △ | △ | △ | △ | △ | △ | △ | △ |

「不具合がないことを確かめた」が全部 △ なのは、テスト用のスクリプトがリポジトリに入っていないからです（HANDOFF.md に、その場で書いた Playwright で確かめたとあるだけ）。
BGM：どのゲームにもありません。オーナーの判断で「あとで」とし、公開の条件から外します。音量の設定には、BGM の欄を見えない状態で用意しておきます。

---

## 4. 不具合・リスク・技術的な借金

重要度：**高** = データが消える、無料枠を超える、ランキングが壊れる／**中** = 体験が悪くなる／**低** = 整理

| # | 重要度 | 場所 | 内容 |
| --- | --- | --- | --- |
| R1 | 高 | cloud.js:189, ranking/index.html:164 | ランキングを1回開くと `kusogeRanks` を最大1000件読む。無料の Spark プランの読み取りは1日5万件なので、参加者が1000人になると1日50回開いただけで上限に達する。総合順位もこの全件読みに頼っている |
| R2 | 高 | raft:2902、cloud.js:31-33, 102, 180 | raft は4秒ごとに `kusoge.raft.save` を書く。そのたびに `nejiUsers` への push（1.5秒の遅延）と `kusogeRanks` への送信（2.5秒の遅延）が走るので、遊んでいる間は1分に約30回書き込む。Spark の書き込み上限（1日2万件）は、約11人時ぶんで尽きる。値が変わっていなくても `submitScores` は毎回書く |
| R3 | 高 | blocks:277,356、raft:2844、cloud.js:31 | 上書きの監視は `setItem` だけなので、`removeItem` が同期されない。ゲームオーバーでローカルの保存を消しても、クラウドには前の保存が残る。次に `pull()` したとき（ローカルが空 → クラウドの方を採用、cloud.js:66）に終わった盤や死んだいかだが復活し、`reloadOnNewer` でページが再読み込みされる |
| R4 | 高 | cloud.js:68、各ゲームの `KoboCloud.sync` | `'newest'` は保存をまるごと比べ、新しい方で上書きする。進行のデータ（`gates.save` のコインとヒーロー、`hole.save` のコインとスキン、`water/parking.save` の最高到達）が、2台の端末で遊ぶと古くなった方に戻ることがある。フィールドごとに max や和集合でマージする必要がある |
| R5 | 高 | firestore.rules:10-17、cloud.js:181-186 | スコアはクライアントが自分で書く。`scores` の値の型も上限も確かめていない。localStorage を書き換えるか、コンソールから `set` するだけで1位になれる。名前も12文字以内なら何でも通る |
| R6 | 中 | neji:1122, 1767 | ネジほどきだけ、サウンドを `nejihodoki3d.sound` に保存し、ハブの共通設定 `kusoge.sound` を無視する |
| R7 | 中 | neji:1128 | デイリーの日付が `new Date()` の現地時間。日本時間で切り替える仕様と合わない（海外の端末では別の問題になる） |
| R8 | 中 | neji:1586-1650 | ネジほどきは `cloud.js` を読み込まず、自分で Firebase を初期化して `nejiUsers` のトップレベル（level/maxLevel/stars/daily/name）に書く。ランキングの送信（`RANK_SOURCES.neji`）は、ほかのページを開いたときにしか走らない |
| R9 | 中 | index.html:303 | ハブのあなぼこシティの記録は `hs.best.score || hs.best.size` を表示するが、保存にあるのは `matchRank/matchPts/soloPct/maxSize`（hole:449）。いつも「ベスト 」と空の値が出る |
| R10 | 中 | cloud.js:159、hole:1573 | ランキングに使う `matchPts` は、最高順位を取ったときの点数で、最高点ではない。ランキングの単位は「点」（ranking:111） |
| R11 | 中 | database.rules.json:9-14, 23-28 | `rooms/$room` は、ログインしていればだれでも書ける。他人の部屋を消したり、他人のスコア `s/{uid}` や結果 `res` を書き換えたりできる。`hole/queue` は全体を読める |
| R12 | 中 | hole:1992-2015 | オンライン対戦の位置を約10Hz で送る。1部屋4人だと、2分の試合で受信が約3MB（目安）。RTDB 無料枠の月10GB だと、月に約3千試合で上限になる。同時接続も100まで |
| R13 | 中 | HANDOFF.md、hole の既知の課題 | 全員が同時に切断すると部屋が残る。部屋の一覧は読めないので、だれも掃除できない |
| R14 | 中 | cloud.js:96-99 | `reloadOnNewer` は、ログインして最初の同期でページを再読み込みする。遊んでいる最中でも再読み込みされる（セッションごとに1回だけ） |
| R15 | 中 | 3D全般 | `webglcontextlost` を処理していない。iOS でタブを切り替えたり、メモリが足りなくなったりすると、画面が黒いまま戻らない |
| R16 | 中 | neji:351-355, 1791 | 影あり（PCFSoft）＋MeshStandard＋DPR 2 で、止まっている間も毎フレーム描画している。低価格の Android では発熱と電池の消費が大きい |
| R17 | 中 | firebase.json:4-11 | `ignore` が `*.md` だけなので、`docs/`・`tools/`（今後）・`.github` 以外は Firebase Hosting に公開される。GitHub Pages ではリポジトリ全体が見える。秘密の値は入れないこと |
| R18 | 低 | index.html:318-342 | `cloud.js` の UI の文字は日本語の直書き。ハブが MutationObserver と正規表現で後から翻訳している |
| R19 | 低 | i18n.js:43 | 言語を切り替えると `location.reload()`。保存していない進行は消える |
| R20 | 低 | ranking:139-141 | 同点でも順位の番号が別になる（総合の点数計算では同点を同じ順位として扱っているのに） |
| R21 | 低 | index.html:185 と設定シート | 言語の選択がトップに2か所ある |
| R22 | 低 | manifest.webmanifest | `id` と `screenshots` がない。`description` にゲーム名が直書き |
| R23 | 低 | 全体 | ゲームの一覧が7か所に直書きされている：index.html のカード、ranking の `GAMES`、cloud.js の `RANK_SOURCES`、sw.js の `GAMES`、i18n.js の正規表現、manifest、README |
| R24 | 低 | `nejiUsers` | 本人がアカウントを削除できない（rules に delete がない）。データの形も検証していない |
| R25 | 低 | HANDOFF.md | GitHub Pages は `gh-pages` に手で push している。忘れると公開先が2つで食い違う |

---

## 5. `common/` に移すべき重複コード

| 重複しているもの | ある場所 | 移す先 |
| --- | --- | --- |
| localStorage の try/catch つきラッパー `store` | 全ゲーム、cloud.js、versus.js | `common/platform.js` の `KoboStore` |
| Firebase SDK の読み込みと初期化 | cloud.js:38-58、neji:1588-1601、versus.js:271-290、hole:1770-1784（4か所） | `common/cloud.js` の `KoboCloud.app()` と `KoboCloud.anon()` |
| オンラインの待ち行列と部屋 | versus.js と hole:1770-2120 | hole は対戦の形が違う（位置の同期）。待ち行列と部屋の生き死にだけを `versus.js` の下の層に分ける（B） |
| AudioContext の初期化、`beep` と SFX、ON/OFF | 全ゲーム（`kusoge.sound` か `nejihodoki3d.sound`） | `common/audio.js` |
| 決まった乱数 mulberry32 と日付の seed | versus.js:79-86、water のエンジン、neji のデイリー | `KoboPlatform.rng()` と `jstDateKey()` |
| トースト、オーバーレイのカード、ボタン、言語の行、← ゲーム一覧 | 全ゲームの CSS と JS | `common/ui.css` と `common/ui.js`（任意で使う部品） |
| PWA のインストール案内 | index.html:308-321、neji:1655- | ハブだけに残す |
| 振動 `buzz/vibrate`、`prefers-reduced-motion` の判定 | 全ゲーム | `KoboPlatform.fx` |
| ゲームの一覧 | R23 の7か所 | `common/games.js`（レジストリ） |

---

## 6. 性能のリスク（3D）

| ゲーム | 気になる点 | 対策の案 |
| --- | --- | --- |
| neji | 影＋Standard＋毎フレーム描画（R16）。のぞくときの透過表示 | 動いていないときは描画しない、影は低画質の設定で切る、DPR の上限を1.5に |
| raft | Lambert で軽いが、海と漂流物を毎フレーム描く。`antialias: true`＋DPR 2 | hole と同じく fps で自動的に画質を下げる |
| gates | インスタンス描画で効率がよい。DPR 2 | 群れの数の上限を確かめる（要実測） |
| n59049 | 変化があるときだけ描画（よい） | — |
| parking | 変化があるときだけ描画（`dirty`）。`low-power` | — |
| hole | ソフトウェア描画で18〜20fps。オブジェクトが多い（`cities.js` 114KB） | すでに自動で画質を下げる。都市ごとのジオメトリの統合や LOD（B） |
| 共通 | context lost を処理していない（R15）。dispose がゲームごとにばらばら | エンジン層で `webglcontextlost/restored` を扱い、`dispose()` を約束事にする |

---

## 7. データとルールのリスク
- **書き込みと読み取りの回数**：R1・R2 が Spark プランの最大のリスク。Phase 1 で先に直す（push を30秒にまとめる、ランキングの送信はベストを更新したときだけ、ランキングは上位N件だけ読んでキャッシュする）。
- **改ざん**：R5・R11。サーバーを置かない方針なので、ルールで「型・上限・単調増加・送信の間隔」を守り、ランキングを見る側でもっともらしさを確かめる（SYSTEM_ARCHITECTURE.md 7章）。
- **データが消える**：R3・R4。マージの種類を増やし、削除はトゥームストーン（削除の印）として同期する。
- **移行**：キー名は変えない。新しいデータは `kobo.*` に足す。ネジほどきの `nejiUsers` のトップレベルのフィールドはそのまま残す。
- **ルールの公開は手作業**：`firestore.rules` と `database.rules.json` はオーナーがコンソールに貼り付ける（firebase.json に firestore/database の設定がない）。ルールを変える作業では「貼り付けるまで新しいクライアントは古いルールでも動く」ことを必ず守る。
