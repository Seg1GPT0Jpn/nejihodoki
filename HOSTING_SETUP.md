# https://neji-5913a.web.app/ で公開する手順

GitHub の main に変更が入るたびに、自動で Firebase Hosting（`neji-5913a.web.app`）へ公開する仕組みは用意済みです（`.github/workflows/firebase-hosting.yml`）。
GitHub から Firebase に公開するための「鍵」だけは、本人のアカウントでしか作れないので、次の2つをお願いします。5分ほどです。

## 1. Firebase で鍵を作る

1. <https://console.firebase.google.com/project/neji-5913a/settings/serviceaccounts/adminsdk> を開きます。
2. 「新しい秘密鍵を生成」→「キーを生成」を押すと、`neji-5913a-firebase-adminsdk-....json` というファイルがダウンロードされます。
   - このファイルは**パスワードと同じくらい大事**です。人に送ったり、チャットに貼ったりしないでください。

## 2. GitHub に鍵を登録する

1. <https://github.com/Seg1GPT0Jpn/nejihodoki/settings/secrets/actions/new> を開きます。
2. 「Name」に `FIREBASE_SERVICE_ACCOUNT` と入れます。
3. 「Secret」に、さっきのファイルをメモ帳などで開いて**中身を全部コピーして貼り付け**ます（`{` から `}` まで）。
4. 「Add secret」を押します。登録した中身は GitHub でもあとから見られない安全な場所に保存されます。
5. 登録したら、ダウンロードしたファイルは削除してかまいません。

登録できたら Claude に「登録した」と伝えてください。公開を実行して、`https://neji-5913a.web.app/` で開けることを確認します。

## うまくいかないとき

公開の記録（<https://github.com/Seg1GPT0Jpn/nejihodoki/actions>）に「権限がない（permission / 403）」と出た場合は、鍵の持ち主に公開の権限を追加します。

1. <https://console.cloud.google.com/iam-admin/iam?project=neji-5913a> を開きます。
2. `firebase-adminsdk-` で始まる行の鉛筆ボタン →「別のロールを追加」→「Firebase Hosting 管理者」を選んで「保存」を押します。
