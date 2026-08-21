// 拼豆识别器 Service Worker - 离线缓存 v7（高清导出 + 内嵌对照表）
var CACHE = "beads-pwa-v7";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./beads-colors.js",
  "./manifest.json",
  "./icon.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // 强制删除所有旧版本缓存，避免冲突
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () {
      return caches.open(CACHE);
    }).then(function (c) {
      return c.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  // 网络优先策略：每次都尝试网络，失败回退缓存
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) {
        return r || caches.match("./index.html");
      });
    })
  );
});
