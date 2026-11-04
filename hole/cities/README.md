# あなぼこシティ：実在の街のデータ

このフォルダの `*.json` は、神奈川の4つの街（藤沢・湘南台・上大岡・湘南高校付近）の地図データです。ページ（`hole/index.html`）がその街を開くときにだけ読み込み、`hole/realcity.js` が地面・道・線路・建物を作ります。

## 出典とライセンス

- 地図データ：**© OpenStreetMap contributors**。ライセンスは [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) です（<https://www.openstreetmap.org/copyright>）。
  - このフォルダの JSON は OpenStreetMap から作った派生データベースなので、同じ ODbL 1.0 で提供します。
  - ゲームの中では、ステージのカード・ながめるモード・プレイ中の画面の右下に「© OpenStreetMap contributors」と出します。
- 標高：国土地理院の標高タイル（`dem5a_png`、なければ `dem_png`）。出典「国土地理院」。
- 駅・学校・川・公共施設などの公共の名前は、地図のラベルや「のみこんだ！」の表示に使います。お店の名前・ブランド・ロゴは使いません（変換ツールが公共の名前だけを残します）。

## 作り方（もう一度作る・ほかの街を足す）

```sh
OSM_CACHE=/path/to/cache node tools/osm-city.js            # 全部の街
OSM_CACHE=/path/to/cache node tools/osm-city.js kamiooka   # 1つだけ
node tools/osm-city.js --list                              # 街の一覧（中心の緯度経度と範囲）
```

- `tools/osm-city.js` の `CITIES` に、街の id・名前・中心（緯度・経度）・半径 `R`（m）か範囲 `box` を書きます。高さを直したい建物は `fix` で上書きできます。
- 元データ（OpenStreetMap API の `/map` タイル、標高タイル）は `OSM_CACHE` の場所に保存し、2回目からはそれを使います。`--refetch` で取り直します。
- できたファイルをページで使うには、`hole/cities.js` に街の定義（`data: 'cities/<id>.json'`、`real: { areas, start, lm, trains … }`）を書きます。

## ファイルの形（v1）

座標は中心からの東向き（x）と南向き（z）のメートルを `q`（0.5 m）単位の整数にしたもので、点の列は差分で書いてあります。

| キー | 中身 |
| --- | --- |
| `b` | 建物 `[種類, 高さdm, 下端の高さdm, フラグ, 点の数, x0, z0, dx, dz, …]`（フラグ 1 = 屋根だけ、8 = ドーム） |
| `rd` | 道 `[種類, 幅dm, 高架, 点の数, …]` |
| `rl` | 線路 `[種類, 高さ(-1 地下 / 0 地上 / 1 高架), 会社, 点の数, …]` |
| `ar` | 面（公園・水・学校・駐車場・ホーム・デッキなど）`[種類, 点の数, …]` |
| `wl` | 川・水路 `[幅dm, 点の数, …]` |
| `tr` | 木 `[x, z, …]` |
| `lb` | 名前 `[[名前, x, z, 種類]]` |
| `en` | 点（地下鉄の入口・バス停・信号・横断歩道）`[[x, z, 種類, 向き, 幅dm]]` |
| `hg` | 標高（20 m ごとの格子、dm、行ごとの差分） |

ファイルの形を変えたら、`hole/cities.js` の街の `v` を上げます（オンライン対戦は、全員のページが同じ `v` の街だけを選びます）。
