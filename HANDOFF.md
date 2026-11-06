# 引き継ぎメモ（別の Claude セッション向け）

このリポジトリは、広告なしのミニゲーム集「ひまつぶし工房」です。

- 公開先: <https://neji-5913a.web.app/>（Firebase Hosting）と <https://seg1gpt0jpn.github.io/nejihodoki/>（GitHub Pages）
- **main にプッシュすると両方に自動で反映されます。**
  - Firebase Hosting: `.github/workflows/firebase-hosting.yml` が自動で公開します。
  - GitHub Pages: `gh-pages` ブランチから配信しています。main をプッシュしたら `git push origin main:gh-pages` もしてください。

## 構成

| フォルダ | ゲーム | 備考 |
| --- | --- | --- |
| `index.html` | トップページ（ゲーム一覧・ログイン・ニックネーム・言語） | |
| `neji/` | ネジほどき 3D | Three.js r128 |
| `blocks/` | ブロックはめ | Canvas 2D |
| `drop/` | おちものタワー | Canvas 2D |
| `raft/` | いかだ暮らし | Three.js r128 |
| `gates/` | ゲートランナー | Three.js r128 |
| `n59049/` | 59049 | Three.js r128 |
| `water/` | いろみず分け | Canvas 2D |
| `parking/` | くるま出し | Three.js r128 |
| `hole/` | あなぼこシティ | Three.js r128。街は14都市。どれも OpenStreetMap と国土地理院のデータから作る（`tools/osm-city.js` → `hole/cities/*.json`、組み立ては `hole/realcity.js`、説明は `hole/cities/README.md`）。オンライン対戦は Firebase Realtime Database（`hole/queue`・`hole/rooms`、ルールは `database.rules.json`）。`?debug` で `window.__hole` |
| `hitsumabushi/` | ひつまぶし工房 | Canvas 2D。保存は `kusoge.hitsumabushi.save`（ランキングは `best`＝1日の最高点）。`?debug` で `window.__hitsu`。通しプレイ：`node tools/tests/hitsumabushi-play.js` |
| `planet/` | わくせいシミュレーター | Three.js r128。気候（緯度帯のエネルギー収支）・炭素と酸素の箱モデル・プレート・生命・文明は同じファイルの `PSim`。保存は `kusoge.planet.save`（ランキングは `total`＝8シナリオのベストの合計）と自由モードの星 `kusoge.planet.world`。対戦なし。`?debug` で `window.__planet`。通しプレイ：`node tools/tests/planet-play.js` |
| `hitblow/` | ヒットアンドブロー | DOM（紙吹雪だけ Canvas）。保存は `kusoge.hitblow.save`（ランキングは `best`＝ひとりで遊んだ1問の最高点）と途中のゲーム `kusoge.hitblow.state`（同期しない）。デイリー・CPU対戦・オンライン対戦（`vs/queue/hitblow`）。`?debug` で `window.__hitblow`。通しプレイ：`node tools/tests/hitblow-play.js` |
| `shogi/` | 将棋 | Canvas 2D。ルールと CPU は `shogi/engine.js`（`ShogiEngine`。Web Worker でも同じファイル。perft は `tools/tests/unit/shogi-engine.test.js`）。保存は `kusoge.shogi.save`（ランキングは `top`＝最強CPUに平手・待ったなしで勝った数）と続きの対局 `kusoge.shogi.game`。オンライン対局は RTDB（`shogi/queue`・`shogi/codes`・`shogi/rooms`、ルールは `database.rules.json`）。`?debug` で `window.__shogi`。通しプレイ：`node tools/tests/shogi-play.js` |
| `ranking/` | ランキング（ゲーム別・総合） | |
| `common/cloud.js` | Googleログインと Firestore 同期・ランキング送信 | `KoboCloud.sync({ key: 'max' or 'newest' })` |
| `common/i18n.js` | 日本語 / 英語の切り替え | `KoboI18n.add({ en: { '日本語': 'English' } })`、`KoboI18n.t('日本語')` |
| `sw.js` | オフライン用 Service Worker | ページを変えたら `VERSION` を上げる |

## 決まりごと

- **ゲームの中身：** 1ゲームにつき1ファイル（`フォルダ/index.html`）で作ります。外部から読み込んでよいのは cdnjs の Three.js r128（`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`）と Google Fonts だけです。
- **元ネタとの距離：** 元になった人気ゲームの名前・キャラクター・絵・ステージは使いません（遊び方のジャンルだけ同じ）。
- **スマホでの見切れ対策：**
  - 画面の高さは `height:100%` と `@supports (height:100dvh){height:100dvh}` で決めます。
  - 上のバーは `env(safe-area-inset-top)`、下のバーは `env(safe-area-inset-bottom)` の分だけ余白を取ります。
  - オーバーレイは画面内に収め、中だけスクロールさせます。メインのボタンは常に見えるようにします。
- **保存：** localStorage のキーは `kusoge.<ゲーム>.*` です。あなぼこシティは `kusoge.hole.save`（`{ best, coins, skins, perks, wins }`）で、ランキングは `best` を使います。キー名や形を変えるときは `common/cloud.js` の `RANK_SOURCES` も合わせて直します。
- **言語：** 画面に出る日本語は `KoboI18n.t()` を通し、英語の辞書を同じファイルに入れます。
- **テスト：** Playwright と Chromium は入っています（`require('playwright')`。WebGL を使うときは `--use-gl=swiftshader` を付けて起動します）。
  - 360×560 / 375×667 / 390×844 などで、ボタンが画面外に出ないことを確かめます。

## いまの作業状況（このメモを書いた時点）

- 全ゲームの英語化と見切れの点検を、別の作業で進めています。あなぼこシティ（`hole/index.html`）も対象で、終わったものから main に入ります。
- **あなぼこシティを直すときは、まず `git pull origin main` で最新にしてから始めてください。** 同じファイルを同時に直すとぶつかります。
- 作業中のものは `games-wip` ブランチに一時保存しています。これは公開されません。
- Firestore のルールは `firestore.rules` です。変えた場合は、オーナーが Firebase コンソールに貼り付ける必要があります。

## あなぼこシティの既知の課題

- テスト環境（ソフトウェア描画）では 18〜20fps でした。重いときは自動で画質（pixel ratio）を 0.75 まで下げます。
- CPU対戦・ソロは14都市からランダム（タイトルの「街」で選べる）。「街を ながめる」で上から自由に見られる。
- オンライン対戦は最大4人、15秒で足りない席はCPU。匿名ログイン（Googleログイン中ならそのアカウント）。
- 全員が同時に切断すると部屋のデータが少し残る（クライアントは部屋の一覧を読めないため）。
