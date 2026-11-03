// Firebase の接続設定。空（null）のあいだはログイン機能は「準備中」と表示され、ゲームはそのまま遊べます。
// Firebase コンソールの「プロジェクトの設定 → マイアプリ → SDK の設定と構成（構成）」に出る値を貼り付けます。
// ここに入れる apiKey などは公開してよい値です（読み書きの権限は firestore.rules で守ります）。
//
// 例:
// window.NEJI_FIREBASE = {
//   apiKey: "AIza...",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project",
//   appId: "1:1234567890:web:abcdef"
// };
window.NEJI_FIREBASE = null;
