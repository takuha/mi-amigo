// Mi Amigo — Service Worker（オフライン対応）
// アプリ本体を端末にキャッシュ。電波が弱いアンティグアの路上でも起動・音声ガイド再生できる。
const CACHE = "mi-amigo-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./firebase-config.js",
  "./data.js",
  "./app.js",
  "./manifest.json",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// アプリ資産はキャッシュ優先、その他はネット優先＋キャッシュ更新
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
