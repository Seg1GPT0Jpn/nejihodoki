# テスト（tools/tests）

Playwright（`require('playwright')`、入っているものを使う。`playwright install` はしない）で、全ページを手元のサーバーで開いて確かめます。npm のパッケージは足していません（`package.json` もありません）。

## 実行のしかた（リポジトリの一番上で）

```sh
node tools/tests/run.js                         # 全部（smoke, viewport, i18n, save, sync）。4並列で約3〜4分
node tools/tests/run.js --vp quick              # 画面サイズを se1・ip12・p8 だけにする（作業のたびに）
node tools/tests/run.js --game blocks           # 1つのページだけ（hub, ranking, 各ゲームの id。カンマで複数）
node tools/tests/run.js --suite smoke,save      # スイートを選ぶ（layout は viewport の別名）
node tools/tests/run.js --vp all --lang en      # 画面サイズ（quick|core|all|se1,land|320x568）と言語（ja,en）
node tools/tests/run.js --list                  # 実行するタスクの一覧だけ出す
node tools/tests/hitsumabushi-play.js          # ひつまぶし工房の通しプレイ（チュートリアル・1営業日・採点・厳しさ・保存・デイリー・英語・特別営業10日（一覧・★と次が開く・キー・タッチ・こわれた保存・英語））
node tools/tests/blocks-play.js                # ブロックはめの通し（本物のドラッグ・キー・CDP のタッチ・モード選び・ステージをクリア・星の保存と次が開く・もどす/入れかえ/ヒント・タイムアタック・古い保存・英語・全画面サイズ×明るい暗い）
node tools/tests/drop-play.js                  # おちものタワーの通し（本物のキー・CDP のタッチ・保存とつづき・スタート画面のキー・ステージ一覧・ステージをクリア・★の保存と次が開く・ピースぎれ・岩・そろい消しのステージ・スプリント・古い保存・英語・全画面サイズ×明るい暗い）
node tools/tests/raft-play.js                  # いかだ暮らしの通し（ふつうのいかだ・キーボード（1〜4・Space・矢印・Esc・V）・航海メニューと説明・ふつうのいかだは脇によけて戻る・ボットで航海1をクリア／施設を建てて航海2・★の保存と次が開く・8つの始まり方・日数ぎれと力尽き・CDP のタッチ・古い保存・英語・全画面サイズ×明るい暗い）
node tools/tests/gates-play.js                 # ゲートランナーの通し（ふつうの出撃・コンボ・キーボード（Enter・M・矢印・Esc・R）・ミッション一覧と鍵・ボットが全12ミッションをクリア・★の保存（kusoge.gates.x）・practice 報告・失敗とやり直し・タッチ・古い／こわれた保存・英語・画面サイズ）
node tools/tests/unit/gates-engine.test.js     # ゲートランナーのミッションの中身（12ミッションの部隊とねらい・★の計算・コイン・kusoge.gates.x の読み込みと記録）
node tools/tests/water-play.js                # いろみず分けの通し（ふつう・キーボード（矢印・Enter・数字・U・H・X・R 2回・M・C・Esc）・モード選び・チャレンジ一覧と鍵・ボットが全12ステージを★3でクリア・★の保存（kusoge.water.x）・practice 報告・ヒントなし／追加なし／道具なし・手数の上限と戻す・スプリント5問とベスト・色の目印・タッチ・古い／こわれた保存・英語・画面サイズ×明るい暗い）
node tools/tests/unit/water-engine.test.js     # いろみず分けの中身（1〜300が前と同じ・ルール・デイリー・チャレンジ12ステージの★と上限・スプリント・kusoge.water.x の読み込みと記録）
node tools/tests/parking-play.js              # くるま出しの通し（ふつう・出庫コンボ・キーボード（矢印・Enter・N・U・H・R 2回・M・L・Esc・数字）・モード選び・ミッション一覧と鍵・ボットが全12ミッションを★3でクリア・★の保存（kusoge.parking.x）・practice 報告・ヒントなし／戻すなし／道具なし・手数の上限と戻す・ラッシュ（時間・ボーナス・時間切れ・ベスト x.r）・タッチ・古い／こわれた保存・英語・画面サイズ×明るい暗い）
node tools/tests/unit/parking-engine.test.js   # くるま出しの中身（1〜200と対戦ロットが前と同じ・ミッション12の★と上限・ラッシュ・kusoge.parking.x の読み込みと記録）
node tools/tests/hole-play.js                 # あなぼこシティの通し（ふつうの対戦が今までどおり・キーボード（タイトルの 1〜6・S・Esc・結果の Enter／R／N／T・WASD）・コンボ・ミッション一覧と鍵・ボットが全12ミッションをクリア・★の保存（kusoge.hole.x）・次が開く・practice 報告・ランキングの値が変わらない・ミッション中は強化が効かない・fast／kills・本物のタッチ・こわれた x・英語・全画面サイズ）
node tools/tests/unit/hole-engine.test.js      # あなぼこシティのミッションの中身（12ミッションの街と★の基準・★の計算・コンボ・kusoge.hole.x の読み込みと記録）
node tools/tests/n59049-play.js               # 59049の通し（ふつう・キーボード（M・矢印・1〜4・H・R・U・N）・モード選びとステージ一覧・ボットが全12ステージをクリア・★の保存（kusoge.n59049.x）・practice 報告・いし・もどすと種つきの出る数字・ヒントの数・ラッシュ60手とベスト・タッチ（CDP のスワイプ）・古い／こわれた保存・英語・画面サイズ×明るい暗い）
node tools/tests/unit/n59049-engine.test.js    # 59049の中身（合体の決まり・いし・種つき乱数・12ステージを探索で全部★3まで解く・ラッシュ・kusoge.n59049.x の読み込みと記録）
node tools/tests/unit/raft-engine.test.js      # いかだ暮らしの航海の中身（8航海のねらい・上限・★・進み具合・kusoge.raft.x の読み込みと開く条件）
node tools/tests/unit/drop-engine.test.js      # おちものタワーの中身（形と順番が変わらない・ライン判定・12ステージ・Sim・ボットが全ステージを解く・進み具合の読み込み）
node tools/tests/unit/blocks-engine.test.js    # ブロックはめの中身（形と順番が変わらない・15ステージ・決まった結果・ボットが全ステージを解く・進み具合の読み込み）
node tools/tests/unit/hitsumabushi-engine.test.js  # ひつまぶし工房の中身（特別営業10日の条件・ねらいの数え方・★・れんぞく・保存 kusoge.hitsumabushi.x の読み込みと記録・engine.js が使われていること）
node tools/tests/hitblow-play.js               # ヒットアンドブローの通し（勝ち・負け・デイリーの答えが全員同じ・CPU対戦を最後まで・保存と再読み込み・英語・オンライン練習・ミッション12（一覧と鍵・ヒットだけ／ブローだけ・はじめのヒント・ひらめき・ボットが全部クリア・★と次が開く・practice 報告・ランキングの値が変わらない・キー／タッチ・こわれた保存・連勝・全画面サイズ））。引数で一部だけ：missions,keysAndTouch,compat,missionsEnglish
node tools/tests/unit/hitblow-engine.test.js     # ヒットアンドブローの中身（判定・ヒットだけ／ブローだけの見え方・点数が前と同じ・12ミッションの条件と★・強いボットが全部解ける・kusoge.hitblow.x の読み込みと記録・連勝・engine.js が使われていること）
node tools/tests/planet-play.js                # わくせいシミュレーターの通し（はじめてのコーチ・彫刻・降りて歩く（キーとタッチ）・一周・発見・時代・危機・8お題の勝ち負け・手で雪玉と図書館・保存と再開・銀河・共有URL・古い保存・ふしぎな星・まなぶと3問チェック・なぜ？・英語・fps）
node tools/tests/shogi-play.js                 # 将棋の通し（CPU に詰みまで・待った・成り・打つ・棋譜・ふたりで・続きから・詰将棋（手数ごとの一覧・ヒント2段階・手順表示）・ヒント・キーボード・棋譜の見返し・四枚落ち・英語・オンライン（エミュレーター）。--no-online で省く）
node tools/tests/unit/shogi-engine.test.js     # 将棋の中身（perft・駒の動き・反則・千日手・入玉宣言・表記・CPU・詰将棋32問を毎回解き直す（一意・最短）・駒落ち7種・ヒント）
node tools/tests/escape-play.js                # からくり工房からの脱出の通し（5部屋を正解の手順で本物のクリック・日本語と英語・ヒント・自動保存と再開・採点・全画面サイズ）
node tools/tests/td-play.js                    # 工房まもりの通し（チュートリアル・本物のタップで建てる／強化／売る・勝ち・負け・エンドレス・デイリー・保存と再開・一時停止・英語・全画面サイズ・200体の性能）
node tools/tests/td-balance.js                 # 工房まもりのバランス（自動プレイで全マップに勝てる・1種類だけの台では★3にならず、マップ4から負ける）
node tools/tests/physics-levels.js             # ころころ工房の全48レベルを保存した答えで解く（ゴール・星3つ・2回流して同じ結果・何もしないと解けない）
node tools/tests/physics-levels.js --adversary # さらに難しさの下限（工房3は部品2つ・工房4は3つ・3-12/4-12 は4つ）より少ない部品で星3つが取れないことを総当たりで（4コアで約20分）
node tools/tests/physics-play.js               # ころころ工房の通し（チュートリアル・本物のドラッグで置く／まわす／動かす・2本指・答えで解く・星・保存と再開・一時停止・英語・全画面サイズ・性能）
node tools/tests/physics-editor-play.js        # ころころ工房「つくる」の通し（本物のドラッグでレベルを作る・ためしてクリア・共有コードと URL・新しいページで開いて解く・壊れたコード・自分のレベル・タッチ・全画面サイズ）
node tools/tests/minigolf-levels.js            # ころがし工房ゴルフの全ホールを保存した答えで流す（パー以内・決まった結果・はさまない・似たホールがない）と、人のまね（minigolf-human.js）の段ごとの成功率（段ごとに6ホール、1〜2分）。--full で全ホール、--solve <id> で答えさがし
node tools/minigolf-gen.js --course 13 --cand 20 # コース4から先のホールを部品から作って、人のまねでえらぶ（1候補およそ1分、4コア）
node tools/tests/minigolf-play.js              # ころがし工房ゴルフの通し（遊び方・チュートリアル・本物のドラッグで打つ・スコアカード・9ホール・保存と再開・練習・今日のホール・一時停止・英語・全画面サイズ）
node tools/tests/pwa-offline.js                # PWA の通し：/ と /nejihodoki/ の両方で、はじめに保存するのはハブと common/ だけ（はじめての転送量を測る）、開いたことのないゲームはオフラインで offline.html、全ゲームを1回開くとそのページと ENGINES が保存されて通信なしで開けること、オフラインのページ（日本語・英語）、マニフェストとインストールの条件（Chrome の判定 CDP Page.getInstallabilityErrors ＋ アイコン・shortcuts・screenshots の大きさ）、更新のトースト（遊んでいる最中は出ない・押したときだけ読み込み直す・古い保存の片付け）。--base /nejihodoki で片方だけ、--game blocks で選ぶ
node tools/tests/load/run.js                   # 負荷テスト（エミュレーターだけ。本番にはつながない）：Firestore 200人（本物の common/*.js）＋ RTDB 50組（本物の Firebase SDK）。約5分。--quick で約2分。結果は tools/tests/load/out/results.json、まとめは docs/LOAD_TEST.md
node tools/tests/colorcards-play.js            # いろあわせカード工房の通し（本物のクリックで1ゲーム・れんしゅうとヒント・ドラッグ・ラスト！とつかまえた！・10ラウンドマッチ・ふたりで・チュートリアル・保存と再開・英語・全画面サイズ）
node tools/tests/unit/colorcards-engine.test.js # いろあわせカード工房の中身（デッキ・CPU 同士の多数の対局・反則の手なし・つよい ＞ よわい）
node tools/tests/train-play.js               # でんしゃでいこうの通し（本物のキーとタッチでノッチを操作・駅に止める・出発・ATS・結果と保存・ルートの開き方・一時停止・英語・全画面サイズ）
node tools/tests/unit/train-engine.test.js    # でんしゃでいこうの中身（決まった結果・ブレーキの遅れと天気・停車位置の点数・信号と ATS・ダイヤ・自動運転が全ルートをクリア）
node tools/tests/brawl-play.js               # おもちゃ大乱闘の通し（本物のキーとマルチタッチで試合・KO・ふたりで1台・ラダー8戦と開く内容・コンティニュー・れんしゅう・一時停止・保存と再開・英語・全画面サイズ）
node tools/tests/unit/brawl-engine.test.js    # おもちゃ大乱闘の中身（決まった結果・ふっとばしの計算・ブラストゾーン・全部の技が当たる・3000試合の CPU 対戦・つよい＞ふつう＞かんたん）。BRAWL_MATCHES=400 で短く
node tools/tests/town-play.js                 # ひまつぶしタウンの通し（本物のタップで建てる・そだてる・旅人・るす番（?debug の時計）・町をひらきなおす・保存と再開・英語・全画面サイズ）
node tools/tests/town-balance.js              # ひまつぶしタウンの経済のバランス（ボットが最適に近く遊ぶ：最初の目標・最初のひらきなおしの時間・行きづまらないこと）
node tools/tests/fit-play.js                  # ぴったりパズル工房の通し（本物のドラッグとタップでステージを解く・ヒント・やり直し・今日のパズル・タイムアタック・保存と再開・英語・全画面サイズ）
node tools/tests/cards-play.js                 # トランプ広場の通し（6ゲームを本物のクリックで最後まで・ドラッグ・れんしゅうとヒント・保存と再開・英語・全画面サイズ）
node tools/tests/shots.js                       # サムネイルを tools/tests/out/thumbs/ に試し撮り
node tools/tests/shots.js --write               # サムネイルを img/thumbs/ に書く（<id>.webp 360×240、<id>@2x.webp 720×480）
```

ほかのオプション：`--jobs N`（並列の数。既定は CPU の数か4の小さいほう）、`--dpr 1`（速くしたいとき）、`--timeout 秒`、`--headed`、`--out <dir>`。
1つでも不合格があると終了コードは 1 です。

## 結果
- `tools/tests/out/report.md`：スイート × ページの表、不合格の一覧（既知の不具合には「既知：R3」のように AUDIT.md の番号）、注意の一覧
- `tools/tests/out/results.json`：全部の結果
- `tools/tests/out/shots/viewport/<page>/<size>-<lang>.png`：画面サイズのスクリーンショット
- `out/`・`load/out/` と `.cache/`（three.js r128 と、負荷テストの Firebase SDK 10.12.2 の写し。初回に curl で取る）は git に入れません

## スイート
| 名前 | 中身 |
| --- | --- |
| smoke | 全ページを空の localStorage で開く：pageerror・console.error・失敗した通信が0件、主な要素（ハブのカードの数＝ゲームの数、ゲームは canvas と ← ホーム）、3D は5秒以内に最初の描画、← ホームで `/` に戻る。3D のゲームは WebGL なしで開いて、案内が出て例外が出ないこと |
| viewport | 全ページ × 画面サイズ（既定 core＝320×568, 360×560, 375×667, 390×844, 414×736）× ja/en。ノッチは CDP の `Emulation.setSafeAreaInsetsOverride` で再現（使えなければ CSS の置き換え）。横スクロールなし、見えている操作は画面内かスクロールできる入れ物の中、開いているオーバーレイの主なボタンが見えていて押せて44px以上、英語で見えている日本語がない。44px 未満の操作は「注意」 |
| i18n | 英語で、隠れた要素や属性も含めて日本語が残っていないか（表示するときに JS が書き直すことが多いので「注意」） |
| save | `fixtures/saves/*.json` の保存を入れて開き、ベストや到達ステージが下がらないこと、表示、再読み込み後も同じこと（古い形：gates の2D版、camp のない hole、maxLevel だけの neji、level だけの water） |
| sync | `https://neji-5913a.web.app` を手元のファイルに差し替え、Firebase の SDK を偽物（`lib/fakes.js`）にして、cloud.js のマージ（`fixtures/cloud/*.json`）と送信のまとめを確かめる。ネットにはつながない。R2・R3・R4 の回帰テストを含む（直るまでは不合格） |

TEST_PLAN.md の game-flow・pause・perf・webgl-lost・sw・platform・live は、必要なもの（`__kb` のフック、`common/platform.js` など）ができてから足します。`--suite` で指定すると「まだない」と出ます。

## 環境のこと
- 外への通信は止めています：three.js は `.cache/` から返し、Google Fonts は空の CSS を返し、そのほか（Firebase など）は遮断します（遮断による console のエラーは数えません）。
- Chromium は `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` で起動します。ページごとに新しい context で、Service Worker は止めています。
- fixtures を足すとき：`fixtures/saves/<名前>.json` に `{ page, desc, storage, expect: [{ key, path, min|eq } | { text: "#id", eq|match }] }`、`fixtures/cloud/` は `{ page, desc, syncedUid, local, mtime, remote: { key: { v, t } }, expect: [{ local|remote: key, path, min|eq|includes|absent }], known }`。
