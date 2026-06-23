// ===== Firebase 設定 =====
// TAKUHA が Firebase コンソールからコピーして、下の FIREBASE_CONFIG に貼り替えるだけでOK。
//
// ⚠️ 重要な区別：
//  ・この「ウェブアプリ設定（apiKey 等）」は、クライアントに埋め込んでOKな“公開情報”です（秘密ではありません）。
//    セキュリティは Firestore のセキュリティルールで守ります。
//  ・「サービスアカウントの秘密鍵(JSON)」は“秘密”です。絶対にここに置かない／チャットに貼らないでください。
//
// 未設定（null）の間は、アプリは今まで通り端末内デモ（localStorage）で動きます。
// 設定を入れると、投票・通知・問い合わせなどがクラウド（全ユーザー共有）に切り替わります。

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjxCBi87AzfAeuq5I78mLtjo2Pm6aQfFg",
  authDomain: "mi-amigo-f6d0a.firebaseapp.com",
  projectId: "mi-amigo-f6d0a",
  storageBucket: "mi-amigo-f6d0a.firebasestorage.app",
  messagingSenderId: "851635897791",
  appId: "1:851635897791:web:95731ae3dc7aab5dd10d0a",
  measurementId: "G-9RFZCKGYKG"
};
