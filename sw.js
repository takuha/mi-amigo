// Mi Amigo — Service Worker（オフライン対応）
// アプリ本体を端末にキャッシュ。電波が弱いアンティグアの路上でも起動・音声ガイド再生できる。
// 方針：コード(html/js/css/json)は「ネット優先」＝更新を即反映。画像は「キャッシュ優先」＝オフラインでも軽快。
const CACHE = "mi-amigo-v35";
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

// コード(html/js/css/json)とページ遷移＝ネット優先（更新を即反映、オフライン時のみキャッシュ）。
// 画像など＝キャッシュ優先（裏で更新）。
const CODE_RE = /\.(html|js|css|json)$/;
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const netFirst = req.mode === "navigate" || CODE_RE.test(url.pathname);

  if (netFirst) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

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
