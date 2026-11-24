# ルールの貼り付け手順（オーナー向け）

新しいルールは2つあります。**Firestore** と **Realtime Database** は別の画面です。どちらも「全部消して、貼り付けて、公開」です。
どちらか片方だけ先に貼っても、ゲームは動きます。

## 準備：いまのルールを控えておく（元に戻したいとき用）
下の「元に戻すとき」に、今のルールの全文を載せてあります。控えは不要ですが、心配なら貼り付ける前に、画面のルールを全部コピーしてメモ帳に保存してください。

## 1. Firestore のルール
1. パソコンのブラウザで <https://console.firebase.google.com/project/neji-5913a/firestore/rules> を開く
   （開けないとき：<https://console.firebase.google.com/> → プロジェクト「neji-5913a」→ 左のメニュー「構築」→「Firestore Database」→ 上のタブ「ルール」）
2. リポジトリの `firestore.rules` を開き、**中身を全部**コピーする
   （作業者から渡された全文を使う。main に入ったあとなら GitHub の <https://github.com/seg1gpt0jpn/nejihodoki/blob/main/firestore.rules> → 右上の「Copy raw file」ボタンでもよい。
   **main に入る前の GitHub には古いルールが載っている**ので注意。1行目が `rules_version = '2';`、2行目が `// ひまつぶし工房：Firestore のルール（P1-4）` なら新しいもの）
3. コンソールのルールの欄をクリック → `Ctrl+A`（Mac は `⌘+A`）で全部選ぶ → `Delete` → `Ctrl+V`（`⌘+V`）で貼り付け
4. 右上の **「公開」** を押す。赤い × やエラーが出たら、貼り付けが途中で切れています。もう一度 2 からやり直してください
5. 「ルールを公開しました」と出たら完了（反映まで1分ほどかかります）

## 2. Realtime Database のルール
1. <https://console.firebase.google.com/project/neji-5913a/database/neji-5913a-default-rtdb/rules> を開く
   （開けないとき：プロジェクト「neji-5913a」→「構築」→「Realtime Database」→ 上のタブ「ルール」）
2. `database.rules.json` の**中身を全部**コピーする（`"vs"` の下に `"$other"` がたくさんあれば新しいもの。GitHub の注意は Firestore と同じ）
3. ルールの欄で全部選んで消し、貼り付ける
4. **「公開」** を押す。エラーが出たら 2 からやり直す
5. 完了

## 新作「わくせいシミュレーター」（planet）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'planet': 10000`＝8シナリオ×最高1,000点）、ランキングの点の確認、プレイ回数の `plus1('planet')`、
  同期する保存のキー `kusoge~planet~save`（記録）と `kusoge~planet~world`（自由モードの星）の形の確認です。
- **Realtime Database は貼り直し不要**です（わくせいシミュレーターには対戦がないので、`database.rules.json` は変えていません）。
- 貼る前でもゲームは遊べます。ランキングへの送信と、別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「ヒットアンドブロー」（hitblow）を足したとき
- **Firestore と Realtime Database の両方**を貼り直してください（上の 1 と 2 と同じ手順で、新しい `firestore.rules` と `database.rules.json` の全文）。
- Firestore で変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'hitblow': 10000`＝1問の最高点は6,480点）、旧ランキングの点の確認、プレイ回数の `plus1('hitblow')`、同期する保存のキー `kusoge~hitblow~save` の形の確認です。
- Realtime Database で変わったのは、対戦のゲームの一覧（3か所の `…|hitsumabushi|hitblow`）だけです。ヒットアンドブローのオンライン対戦は `vs/queue/hitblow` を使います。
- 貼る前でもゲームは遊べます（CPU対戦・デイリーも）。ランキングへの送信、別の端末への同期、オンライン対戦だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「将棋」（shogi）を足したとき
- **Firestore と Realtime Database の両方**を貼り直してください（上の 1 と 2 と同じ手順で、新しい `firestore.rules` と `database.rules.json` の全文）。
  - Firestore：ゲームの一覧 `games()` と上限 `caps()`（`'shogi': 100000`＝最強CPUに勝った数）、ランキングの点の確認、プレイ回数の `plus1('shogi')`、
    同期する保存のキー `kusoge~shogi~save`（記録）と `kusoge~shogi~game`（続きの対局）の形の確認。
  - Realtime Database：`"shogi"` の下を丸ごと追加（`queue`＝ランダム対戦の待ち行列、`codes`＝友だちと遊ぶ6けたのコード、`rooms`＝対局の部屋）。
    指し手は部屋の2人だけが、自分の番にだけ、番号の順に足せます（消す・書き換えるはできない）。時刻はサーバーの時刻だけ。結果は1回だけ書けます。
- 貼る前でも、CPU・ふたりで・詰将棋は遊べます。オンライン対局と、ランキング・別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「からくり工房からの脱出」（escape）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'escape': 10000`＝5部屋×最高1,000点。部屋を足せる余り）、旧ランキングの点の確認 `okScore(…'escape')`、
  プレイ回数の `plus1('escape')`、同期する保存のキー `kusoge~escape~save`（部屋ごとの記録）の形の確認です。とちゅうの部屋（`kusoge.escape.run`）は同期しません。
- **Realtime Database は貼り直し不要**です（脱出ゲームには対戦がないので、`database.rules.json` は変えていません）。
- 貼る前でもゲームは遊べます。ランキングへの送信と、別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「工房まもり」（td）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'td': 1000000`＝エンドレスやデイリーの1回の点。生き残った波ごとに 10×波の番号×マップの倍率）、旧ランキングの点の確認 `okScore(…'td')`、
  プレイ回数の `plus1('td')`、同期する保存のキー `kusoge~td~save`（マップごとの記録）の形の確認です。とちゅうのゲーム（`kusoge.td.run`）は同期しません。
- **Realtime Database は貼り直し不要**です（工房まもりには対戦がないので、`database.rules.json` は変えていません）。
- 貼る前でもゲームは遊べます。ランキングへの送信と、別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「ころころ工房」（physics）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'physics': 1000`＝星の合計。今は48レベル×3＝144）、旧ランキングの点の確認（`okLegacyScores()`。16ゲームで式の数の上限を超えたので、上限の表 `caps()` を1回だけ読む `okCap()` に書き直した。中身の判定は前と同じ）、
  プレイ回数の `plus1('physics')`、同期する保存のキー `kusoge~physics~save`（レベルごとの記録）の形の確認です。置きかけの部品（`kusoge.physics.run`）と答え（`kusoge.physics.sols`）は同期しません。
- **Realtime Database は貼り直し不要**です（ころころ工房には対戦がないので、`database.rules.json` は変えていません）。
- 貼る前でもゲームは遊べます。ランキングへの送信と、別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「ころがし工房ゴルフ」（minigolf）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'minigolf': 1000`＝コースごとの「パー − 9ホールのベスト」の合計。今は3コースで最大53）、旧ランキングの点の確認 `okCap(…'minigolf')`、
  プレイ回数の `plus1('minigolf')`、同期する保存のキー `kusoge~minigolf~save`（コースごとの記録）の形の確認です。とちゅうのラウンド（`kusoge.minigolf.run`）は同期しません。
- **Realtime Database は貼り直し不要**です（ころがし工房ゴルフには対戦がないので、`database.rules.json` は変えていません）。
- 貼る前でもゲームは遊べます。ランキングへの送信と、別の端末への同期だけが、貼るまで失敗します（端末の保存は残ります）。

## 新作「トランプ広場」（cards）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、トランプ広場のランキング送信と端末間の同期だけが失敗します**（ゲームは遊べて、端末の保存は残ります）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'cards': 100000`＝勝ったときにもらえる★の合計。よわい1・ふつう2・つよい3）、旧ランキングの点の確認 `okCap(…'cards')`（physics のときに入れた `okCap()` に1行足しただけで、式の数の上限の中に収まっています）、
  プレイ回数の `plus1('cards')`、同期する保存のキー `kusoge~cards~save`（★・ゲームごとの記録・最後の設定）の形の確認です。とちゅうのゲーム（`kusoge.cards.game`）は同期しません。
- **Realtime Database は貼り直し不要**です（トランプ広場には対戦がないので、`database.rules.json` は変えていません）。

## 新作「ぴったりパズル工房」（fit）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、ぴったりパズル工房のランキング送信と端末間の同期だけが失敗します**（ゲームは遊べて、端末の保存は残ります）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'fit': 1000`＝タイムアタックで3分に解いた数。今日のパズルの点は 600 から秒数を引いた値で、これも 1000 以下）、旧ランキングの点の確認 `okCap(…'fit')`（cards のときと同じく `okCap()` に1行足しただけで、式の数の上限の中に収まっています）、
  プレイ回数の `plus1('fit')`、同期する保存のキー `kusoge~fit~save`（ステージごとの星と最短時間・タイムアタックの最高・統計）の形の確認です。とちゅうのパズル（`kusoge.fit.run`）は同期しません。
- **Realtime Database は貼り直し不要**です（ぴったりパズル工房には対戦がないので、`database.rules.json` は変えていません）。

## 新作「ひまつぶしタウン」（town）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、ひまつぶしタウンのランキング送信と端末間の同期だけが失敗します**（ゲームは遊べて、端末の保存は残ります）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'town': 100000`＝町の人口の最高。町は一辺10マスまでなので、実際は数千人まで）、旧ランキングの点の確認 `okCap(…'town')`（fit のときと同じく `okCap()` に1行足しただけで、式の数の上限の中に収まっています）、
  プレイ回数の `plus1('town')`、同期する保存のキー `kusoge~town~save`（人口の最高・ほまれ・研究・終えた目標・統計）の形の確認です。いまの町（`kusoge.town.run`）は同期しません。
- **Realtime Database は貼り直し不要**です（ひまつぶしタウンには対戦がないので、`database.rules.json` は変えていません）。

## 新作「いろあわせカード工房」（colorcards）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、いろあわせカード工房のランキング送信と端末間の同期だけが失敗します**（ゲームは遊べて、端末の保存は残ります）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'colorcards': 100000`＝★の合計）、旧ランキングの点の確認 `okCap(…'colorcards')`（town のときと同じく `okCap()` に1行足しただけで、式の数の上限の中に収まっています）、
  プレイ回数の `plus1('colorcards')`、同期する保存のキー `kusoge~colorcards~save`（★・勝った回数・統計）の形の確認です。とちゅうのゲーム（`kusoge.colorcards.game`）は同期しません。
- **Realtime Database は貼り直し不要**です（対戦がないので、`database.rules.json` は変えていません）。

## 新作「おもちゃ大乱闘」（brawl）を足したとき ＋ 同期の書き込みが止まる問題のなおし（2026-11）
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、おもちゃ大乱闘のランキング送信と同期が失敗します。さらに、同期するキーが15個ほどある人は、いまのルールのままだと、どのゲームの同期も止まります**（ゲームは遊べて、端末の保存は残ります）。
- 変わったところ：
  1. `games()` と `caps()`（`'brawl': 100000`＝ラダー1周のベスト得点）、`okCap(…'brawl')`、`plus1('brawl')`、同期キー `kusoge~brawl~save`（記録・開いたおもちゃとステージ・統計）。
  2. **式の数の上限（1回の書き込みで1000）のなおし**：`merge` の書き込みでは、すでにあるキーも含めた全部が `request.resource` に入るため、以前は毎回ぜんぶのキーの形を確かめていて、**キーが15個ほどになると上限を超えて、書き込みが拒否されていました**（ゲームが増えるほど悪化。テストが「ぜんぶのキーを1回で書く」「15個以上たまった文書に1つ足す」を確かめていなかったので気づきませんでした）。いまは `diff().affectedKeys()` で**「この書き込みで変わるキーだけ」**の形を確かめます（確かめる中身は同じ。変わらないキーは前の書き込みで確かめずみ）。`okEnt` も、`e` を使う回数をへらした同じ強さの形に（`e.keys().hasOnly(['v','t'])`・`t` は数・`v` は null か 300,000 文字以内の文字列）。1回に変えられるキーは8個くらいまでなので、`common/cloud.js` は8個ずつに分けて書きます（最初の同期で多くのキーを送るとき）。
  3. 拒否するもの（変わらず）：`v` が数や list・`t` がない／数でない・`v`／`t` 以外のフィールド・map でないエントリ・300 キー超・他人の書き込み・上限超えの点。テスト（`tools/tests/rules/cases.js`）に、「知っているキーをぜんぶ」「8個ずつ全キーまで増やす」「全キーがある文書で1個・8個を変える」「その中に悪いエントリが混じると拒否」「新しい文書で悪いエントリ／v なし」を足しました。
- **Realtime Database は貼り直し不要**です（対戦がないので、`database.rules.json` は変えていません）。

## ころがし工房ゴルフのランキングを「星の合計」に変えたとき（2026-11）
- **貼り直し不要**です。ランキングの値は「パーより少ない打数」から「星の合計」（最大594）に変わりましたが、上限 `'minigolf': 1000` の中なので `firestore.rules` は同じです。

## 3. 貼り付けたら
作業者（Claude）に「貼り付けた」と伝えてください。本番でテスト（`node tools/tests/rules/run.js --live`）を流して、
許可と拒否が正しいか、対戦（あなぼこシティとほかのゲーム）が2人で最後まで動くかを確かめます。

## あとで：管理者（オーナー）の uid を入れる
今は `OWNER_UID_HERE` という仮の値で、**だれも管理者になりません**（このままでも安全です。管理者ができるのは、ランキングの行を消すことだけ）。
1. コンソールの「構築」→「Authentication」→「ユーザー」で、自分の Google アカウント（メールアドレス）の行の「ユーザー UID」をコピー
2. Firestore のルールの画面で `OWNER_UID_HERE` を探し（`Ctrl+F`）、その文字だけを UID に置き換える（`'` は残す）。例：`['abcDEF123...']`
3. 「公開」を押す。リポジトリの `firestore.rules` も同じに直すよう、作業者に頼んでください

## 旧ランキング（kusogeRanks）の書き込み期限
旧ランキングへの書き込みは **2026年12月2日 0:00（日本時間）** で自動的に止まり、そのあとは読むだけになります（古いページは送信に失敗しても遊べます）。
新しいランキング（P1-6）が間に合わないときは、`firestore.rules` の `timestamp.date(2026, 12, 1)` の日付を延ばして公開し直します（作業者に頼んでください）。

## 元に戻すとき（今のルールの全文）
問題が出たら、同じ手順でこちらを貼り付けて「公開」すれば、今と同じ状態に戻ります。

Firestore：
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /nejiUsers/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid;
    }
    match /kusogeRanks/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['name', 'scores', 'updatedAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1 && request.resource.data.name.size() <= 12
        && request.resource.data.scores is map
        && request.resource.data.scores.size() <= 20;
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Realtime Database：
```
{
  "rules": {
    ".read": false,
    ".write": false,
    "hole": {
      "queue": { ".read": "auth != null", "$uid": { ".write": "auth != null && auth.uid === $uid" } },
      "rooms": { "$room": { ".read": "auth != null", ".write": "auth != null" } }
    },
    "vs": {
      "queue": { "$game": { ".read": "auth != null", "$uid": { ".write": "auth != null && auth.uid === $uid" } } },
      "rooms": { "$room": { ".read": "auth != null", ".write": "auth != null" } }
    }
  }
}
```

## 新作「でんしゃでいこう」（train）を足したとき
- **Firestore だけ**貼り直してください（上の「1. Firestore のルール」と同じ手順で、新しい `firestore.rules` の全文）。**貼り直さないと、でんしゃでいこうのランキング送信と端末間の同期だけが失敗します**（ゲームは遊べて、端末の保存は残ります）。
  変わったのは、ゲームの一覧 `games()` と上限 `caps()`（`'train': 100000`＝9ルートのベスト得点の合計）、旧ランキングの点の確認 `okCap(…'train')`、プレイ回数の `plus1('train')`、
  同期する保存のキー `kusoge~train~save`（合計・★・ルートごとのベスト・統計）の形の確認（`okEntAt` に1行）です。式の数は、変わるキーだけを確かめる今の形のままで収まっています（テストが、全キーまで8個ずつ増やしても通ることを確かめます）。
- **Realtime Database は貼り直し不要**です（対戦がないので、`database.rules.json` は変えていません）。

## 「ぴったりパズル工房」（fit）にオンライン対戦を足したとき
- **Realtime Database だけ**貼り直してください（上の「2. Realtime Database のルール」と同じ手順で、新しい `database.rules.json` の全文）。**貼り直さないと、ぴったりパズル工房の「オンライン対戦」で相手が見つからず「準備中」になります。**
- 変わったのは、対戦のゲームの一覧（3か所の `…|hitsumabushi|hitblow|fit`）だけです。ぴったりパズル工房のオンライン対戦は `vs/queue/fit` を使います。
- **Firestore は貼り直し不要**です（`firestore.rules` は変えていません。対戦の記録はこの端末の `kusoge.vs.stats` だけ）。
