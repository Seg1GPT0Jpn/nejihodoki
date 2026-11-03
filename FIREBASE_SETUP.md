# ネジほどき：Googleログインを使えるようにする手順

Googleログインのしくみはゲームに組み込み済みです。
あとは、あなたのGoogleアカウントで Firebase（Googleの無料サービス）のプロジェクトを1つ作るだけです。
これは本人のログインが必要な作業なので、代わりにできません。所要時間は10分ほど、費用は無料です。

最後の手順で出てくる設定の文字列を Claude に貼り付ければ、組み込みと公開は Claude がやります。

---

## 1. プロジェクトを作る

1. <https://console.firebase.google.com/> を開き、Googleアカウントでログインします。
2. 「プロジェクトを作成」（または「プロジェクトを追加」）を押します。
3. 名前に `nejihodoki` などを入れて「続行」を押します。
4. 「Google アナリティクス」はオフにして「プロジェクトを作成」を押し、完了したら「続行」を押します。

## 2. Googleログインを有効にする

1. 左のメニューの「構築」→「Authentication」を開き、「始める」を押します。
2. 「ログイン方法」タブで「Google」を選びます。
3. 右上のスイッチを「有効にする」にし、「プロジェクトのサポートメール」で自分のメールを選んで「保存」を押します。
4. 「設定」タブ →「承認済みドメイン」→「ドメインを追加」を押し、次を入れて「追加」を押します。

   ```
   seg1gpt0jpn.github.io
   ```

## 3. 保存場所（Firestore）を作る

1. 左のメニューの「構築」→「Firestore Database」を開き、「データベースを作成」を押します。
2. ロケーションは `asia-northeast1 (Tokyo)` を選びます。
3. 「本番環境モードで開始する」を選んで「作成」を押します。
4. 「ルール」タブを開き、中身をすべて消して、次の内容を貼り付けて「公開」を押します。
   （このリポジトリの `firestore.rules` と同じ内容です。ログインした本人だけが、自分の記録を読み書きできます）

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /nejiUsers/{uid} {
         allow read: if request.auth != null && request.auth.uid == uid;
         allow create, update: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

## 4. 設定の文字列をコピーする

1. 左上の歯車 →「プロジェクトの設定」を開きます。
2. 下のほうの「マイアプリ」で `</>`（ウェブ）のマークを押します。
3. アプリのニックネームに `neji` と入れて「アプリを登録」を押します（Firebase Hosting のチェックは不要です）。
4. 表示される `const firebaseConfig = { ... };` の `{ ... }` の部分をコピーして、Claude に貼り付けてください。

   例（値はプロジェクトごとに違います）:

   ```
   apiKey: "AIza....",
   authDomain: "nejihodoki-xxxx.firebaseapp.com",
   projectId: "nejihodoki-xxxx",
   storageBucket: "...",
   messagingSenderId: "...",
   appId: "1:...:web:..."
   ```

   この値はWebページに書いて公開してよいものです（読み書きの権限は手順3のルールで守られます）。

---

## しくみ（参考）

- 設定は `firebase-config.js` に入ります。空のあいだは、メニューに「準備中」と表示されるだけで、ゲームはそのまま遊べます。
- ログインすると、進み具合（到達レベル・星・今日のチャレンジの記録）が Firestore の `nejiUsers/{ユーザーID}` に保存されます。
- 別の端末でログインすると、記録の良いほう（到達レベルの高いほう、星の多いほう）にまとめられます。
- claude.ai のアーティファクト版では外部との通信ができないため、ログインは GitHub Pages 版（<https://seg1gpt0jpn.github.io/nejihodoki/>）だけで使えます。
