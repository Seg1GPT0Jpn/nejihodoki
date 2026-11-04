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
