# テスト計画（設計のみ。スクリプトはまだ書かない）

## 1. 方針
- 今までその場で書いていた Playwright の確認を、`tools/tests/` にまとめて、いつでも同じように動かせるようにします。
- 使えるもの：`require('playwright')`（1.63、Chromium）。`@playwright/test` は入っていないので、テストの実行役は自分で書きます（`node tools/tests/run.js`）。`firebase-tools` と Firestore のエミュレータは入っていません（Java はある）。
- npm のパッケージは足しません（ビルドなしの方針を保つ）。`package.json` も作りません。

## 2. 置き場所
```
tools/tests/
  run.js                 実行役：node tools/tests/run.js [--suite smoke,layout,save,…] [--game blocks] [--vp all|quick] [--lang ja,en] [--live] [--update-shots]
  lib/
    server.js            ローカルのサーバー（python3 -m http.server を子プロセスで立てる。だめなら node の http で静的に配る）。ポートは空いているものを選ぶ
    browser.js           Chromium の起動：--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist。ページごとに新しい context
    viewports.js         画面サイズの一覧（4章）と、ノッチの再現
    https-origin.js      本番の origin（https://neji-5913a.web.app）へのリクエストを page.route で受けて、ローカルのファイルを返す（5章）
    storage.js           localStorage を入れる・読む・空にする。fixtures の読み込み
    assert.js            小さな assert と、結果の記録（JSON と、人が読める表）
    hooks.js             ?debug のフック（window.__kb、__neji、__hole）を呼ぶ補助
    fakes.js             AudioContext のスタブ、Date.now の固定（日本時間の境目）、visibilitychange を出す
  suites/
    smoke.js             全ページ：開いてエラーが0件、主な要素がある
    layout.js            全ページ × 画面サイズ × 言語：ボタンが画面内、横スクロールなし、スクリーンショット
    i18n.js              英語で、表示されている文字に日本語が残っていない
    game-flow.js         各ゲーム：始める → 少し遊ぶ → 負け/クリア → もう一度（__kb のフック）
    pause.js             リアルタイムのゲーム：隠すと止まり、戻っても止まったまま
    save.js              保存 → 再読み込み → 同じ状態。古い形の保存（fixtures）の読み込み
    sync-merge.js        cloud.js のマージ関数とトゥームストーンの単体テスト（ブラウザの中で、Firebase なし）
    platform.js          jstDateKey・rng・XP の上限・実績の判定の単体テスト
    perf.js              3D のゲーム：60秒の fps、描画の回数、止まっているときに描画しないこと
    webgl-lost.js        WEBGL_lose_context で context lost → 復帰
    sw.js                Service Worker：1回開いたあと、通信を切っても開ける
    live/
      auth.js            本番の Firebase で匿名ログインできる
      sync.js            2つの context（2台の端末の代わり）で、同じ匿名アカウントの同期を確かめる
      rank.js            kbBoards への送信・読み取り（テスト用のボード）
      quota.js           1回の表示での読み書きの回数を数える（Firestore の通信を page.on('request') で数える）
  rules/                 （P1-4 の担当）
    firestore.js         許可と拒否の表（6章）を、本番に対して匿名ログインで実行する
    rtdb.js              同じことを RTDB で
  fixtures/
    saves/               古い形の保存（例：gates の2D版の save、hole の camp がない save、neji の maxLevel だけ）
    cloud/               nejiUsers.games の例（R3・R4 の再現用）
  shots.js               ホームのカード用のスクリーンショットを作る（img/thumbs/*.webp、360×240 と 720×480）
  out/                   結果（.gitignore に入れる。スクリーンショット、results.json、report.md）
```

## 3. ページの一覧
`/`、`/ranking/`、`/neji/`、`/blocks/`、`/drop/`、`/raft/`、`/gates/`、`/n59049/`、`/water/`、`/parking/`、`/hole/`（P1-7 のあとは、`/profile/`、`/about/` も）。
P1-2 のあとは、`common/games.js` から作ります（手で書かない）。

## 4. 画面サイズと言語
| 名前 | サイズ | DPR | safe-area（上／下） | 備考 |
| --- | --- | --- | --- | --- |
| se1 | 320×568 | 2 | 20 / 0 | いちばん小さい |
| a360 | 360×640 | 3 | 24 / 0 | Android |
| se2 | 375×667 | 2 | 20 / 0 | |
| ip12 | 390×844 | 3 | 47 / 34 | ノッチ |
| p8 | 414×736 | 3 | 20 / 0 | |
| xr | 414×896 | 2 | 48 / 34 | ノッチ |
| land | 667×375 | 2 | 0 / 21（左右 44） | 横向き |
| inapp | 390×700 | 3 | 47 / 34 | アプリ内ブラウザ（下のバーぶん、高さが小さい） |

- `quick` は se1・ip12・p8 だけ。`all` は全部。言語は `ja` と `en`（`kobo.lang` を入れる）。
- **ノッチの再現**：Chromium では `env(safe-area-inset-*)` を直接は変えられません。そこで、テスト用に `--kb-test-sat` などの CSS 変数を差し込み、`env()` を置き換える CSS（`addStyleTag` で、`env(safe-area-inset-top)` を使っているルールを上書きする）を入れます。別の方法として、CDP の `Emulation.setSafeAreaInsetsOverride` が使えるバージョンなら、そちらを使います（`browser.js` が使えるかどうかを調べて選ぶ）。
- タッチ：`hasTouch: true, isMobile: true`。

## 5. 本番の Firebase を使うテスト
- `cloud.js` は https のときだけ動きます（cloud.js:44）。`https-origin.js` は `https://neji-5913a.web.app/**` へのリクエストを `page.route` で受け、ローカルのファイルを返します。これで、**手元のコードを本番の origin で**動かせ、Firebase（Auth・Firestore・RTDB）には本当につながります。Google ログインはできないので、匿名ログインを使います。
- テストで書き込むデータ：
  - Firestore：テスト用のボード名 `zz-test~all` は `games()` に入っていないので、ルールで拒否されます。拒否されることを確かめるのにだけ使います。許可される書き込みは、テストのたびに作る匿名アカウントの自分の行だけで、終わったら消します（`allow delete: if isMe(uid)`）。
  - RTDB：`vs/queue/zztest/{uid}` と、テストで作った部屋だけ。終わったら消します。
- 無料枠を守るため、`--live` を付けたときだけ実行し、1回の実行で読み取り500件・書き込み100件までにします（`quota.js` が数えて、超えたら止める）。
- CI では実行しません（秘密の値が要らない範囲でも、無料枠を使うため）。手元で、ルールや同期を変えたときに実行します。

## 6. ルールのテスト（許可と拒否の表）
| 対象 | 操作 | 期待 |
| --- | --- | --- |
| `kbBoards/blocks~all/e/{me}` | `{u:me,n:'t',s:10,t:serverTime}` を作る | 許可 |
| 同上 | `s` を 5 に下げる | 拒否 |
| 同上 | 5秒以内にもう一度上げる | 拒否 |
| 同上 | `s` が cap を超える | 拒否 |
| `kbBoards/blocks~d<昨日の2日前>/e/{me}` | 作る | 拒否 |
| `kbBoards/blocks~all/e/{他人}` | 作る | 拒否 |
| `kbBoards/blocks~all/e` | `limit(51)` で読む | 拒否 |
| `kbProfiles/{me}` | `xpw: 99999` | 拒否 |
| `kbPlays/w<今週>` | `blocks` を +1 | 許可 |
| 同上 | `blocks` を +2、または2つのゲームを同時に +1 | 拒否 |
| `nejiUsers/{他人}` | 読む | 拒否 |
| `kusogeRanks/{me}` | 今の cloud.js の形で書く | 許可（古いクライアントが動く） |
| RTDB `vs/rooms/{room}` | 自分を `h` にして作る | 許可 |
| 同上 | 他人の `s/{uid}` を書く | 拒否 |
| 同上 | メンバーでない人が部屋を消す（作ってから10分以内） | 拒否 |
| 同上 | versus.js の1試合の流れ（2つの context） | すべて許可され、試合が終わる |
| RTDB `hole/rooms/{room}` | hole の1試合の流れ（2つの context、ボットあり） | すべて許可され、試合が終わる |

## 7. 保存と同期の回帰テスト
- **再読み込み**：各ゲームを少し遊ぶ（`__kb.step`）→ 再読み込み → `__kb.state()` が同じ。
- **古い形の読み込み**：`fixtures/saves/*.json` を入れて開き、エラーなく読み込めて、ベストやステージが下がらないこと（gates の `migrate()`、hole の `loadSave()` の補完）。
- **マージ関数**（`sync-merge.js`、Firebase なし）：
  - R3：ローカルを削除（トゥームストーン）、リモートには古い値 → 結果は「削除」。
  - R4：端末 A の `water.save {level:5,best:9}`、端末 B の新しい `{level:3,best:7}` → `{level:5,best:9}`（フィールドごと）。
  - `max` のキーに数値でない値 → 例外を出さず、ローカルを残す。
  - XP の帳簿：同じ日を2台で → 合計に上限をかけた値。
- **本番での同期**（`live/sync.js`）：context A と B に同じ匿名アカウントの資格情報を入れ（IndexedDB の Firebase の保存をコピーする）、A で保存 → 30秒以上待つか `pagehide` → B で開く → B に反映される。
- **書き込みの回数**（`live/quota.js`）：raft を3分遊んで、Firestore への書き込みが7回以下（30秒ごと＋隠したとき）であること。ランキングのページを1回開いて、読み取りが60件以下であること。

## 8. スモークテストの中身（全ページ）
1. 空の localStorage で開く → `load` まで → `pageerror` と `console.error` が0件（Firebase の「オフライン」の警告は例外の一覧に入れる）。
2. 主な要素がある：ハブはゲームカードがレジストリと同じ数、ゲームは canvas と上のバー。
3. 3D：最初の描画が5秒以内に終わる（`__kb.ready()`）。WebGL が使えないときの案内（raft:2911 のような）が出ること（`--disable-gpu --disable-software-rasterizer` で起動して確かめる）。
4. ← ホームのリンクで `/` に戻れる。

## 9. 実行の時間の目安
- `quick`（smoke＋layout quick＋sync-merge＋platform）：5分以内。作業が終わるたびに実行します。
- `all`（全部、ただし live を除く）：30分以内。各フェーズの終わりに実行します。
- `--live`：ルールか同期を変えたときだけ。

## 10. 結果の報告
`tools/tests/out/report.md`：スイートごとの合否、落ちたテストと理由、スクリーンショットのパス、fps の表（前回との比較）。作業の完了報告には、この表の要約を貼ります（CLAUDE_CODE_MASTER_PROMPT.md）。
