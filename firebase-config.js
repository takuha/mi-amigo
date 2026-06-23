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

// Webプッシュ用 VAPIDキー（Firebaseコンソール → プロジェクト設定 → Cloud Messaging →
// 「ウェブ設定」→ ウェブプッシュ証明書 → 鍵ペアを生成 でコピーした文字列を入れる）。
// 空の間はプッシュ購読はスキップ（ローカル通知のみで動作）。これは公開してOKな公開鍵です。
window.FIREBASE_VAPID_KEY = "BN12fd80Npp9KaxGY_ypYHhRDmc_C90XRbqzYj7DIni9Bj6iO5pO1iNDiTOz8wdEy8P5Kdr1LX4QQhhajPtoIUM";
