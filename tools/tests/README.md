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
node tools/tests/hitsumabushi-play.js          # ひつまぶし工房の通しプレイ（チュートリアル・1営業日・採点・厳しさ・保存・デイリー・英語）
node tools/tests/hitblow-play.js               # ヒットアンドブローの通し（勝ち・負け・デイリーの答えが全員同じ・CPU対戦を最後まで・保存と再読み込み・英語）
node tools/tests/planet-play.js                # わくせいシミュレーターの通し（気候の物理・全球凍結と脱出・暴走温室・風化・シナリオの勝ち負け・保存・英語）
node tools/tests/shogi-play.js                 # 将棋の通し（CPU に詰みまで・待った・成り・打つ・棋譜・ふたりで・続きから・詰将棋・英語・オンライン（エミュレーター）。--no-online で省く）
node tools/tests/escape-play.js                # からくり工房からの脱出の通し（5部屋を正解の手順で本物のクリック・日本語と英語・ヒント・自動保存と再開・採点・全画面サイズ）
node tools/tests/td-play.js                    # 工房まもりの通し（チュートリアル・本物のタップで建てる／強化／売る・勝ち・負け・エンドレス・デイリー・保存と再開・一時停止・英語・全画面サイズ・200体の性能）
node tools/tests/td-balance.js                 # 工房まもりのバランス（自動プレイで全マップに勝てる・1種類だけの台では★3にならず、マップ4から負ける）
node tools/tests/physics-levels.js             # ころころ工房の全48レベルを保存した答えで解く（ゴール・星3つ・2回流して同じ結果・何もしないと解けない）
node tools/tests/physics-play.js               # ころころ工房の通し（チュートリアル・本物のドラッグで置く／まわす／動かす・2本指・答えで解く・星・保存と再開・一時停止・英語・全画面サイズ・性能）
node tools/tests/shots.js                       # サムネイルを tools/tests/out/thumbs/ に試し撮り
node tools/tests/shots.js --write               # サムネイルを img/thumbs/ に書く（<id>.webp 360×240、<id>@2x.webp 720×480）
```

ほかのオプション：`--jobs N`（並列の数。既定は CPU の数か4の小さいほう）、`--dpr 1`（速くしたいとき）、`--timeout 秒`、`--headed`、`--out <dir>`。
1つでも不合格があると終了コードは 1 です。

## 結果
- `tools/tests/out/report.md`：スイート × ページの表、不合格の一覧（既知の不具合には「既知：R3」のように AUDIT.md の番号）、注意の一覧
- `tools/tests/out/results.json`：全部の結果
- `tools/tests/out/shots/viewport/<page>/<size>-<lang>.png`：画面サイズのスクリーンショット
- `out/` と `.cache/`（three.js r128 の写し。初回に curl で取る）は git に入れません

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
