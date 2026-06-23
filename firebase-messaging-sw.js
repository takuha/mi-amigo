// Mi Amigo — Firebase Cloud Messaging 受信用 Service Worker（バックグラウンド通知）
// アプリを閉じている時に届いたプッシュを、端末の通知として表示する。
// ※ここの設定はクライアント公開OKな値（apiKey等は秘密ではない）。
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDjxCBi87AzfAeuq5I78mLtjo2Pm6aQfFg",
  authDomain: "mi-amigo-f6d0a.firebaseapp.com",
  projectId: "mi-amigo-f6d0a",
  storageBucket: "mi-amigo-f6d0a.firebasestorage.app",
  messagingSenderId: "851635897791",
  appId: "1:851635897791:web:95731ae3dc7aab5dd10d0a",
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const n = (payload && payload.notification) || {};
  self.registration.showNotification(n.title || "Mi Amigo", {
    body: n.body || "",
    icon: "img/icon-192.png",
    badge: "img/icon-192.png",
    data: (payload && payload.data) || {},
  });
});
