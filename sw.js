/* Service Worker - app shell offline. Naikkan CACHE_VERSION setiap update file. */
var CACHE_VERSION = 'dj-pos-v1';
var SHELL = ['./', './index.html', './config.js', './api.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // panggilan API (POST) tidak di-cache
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;             // hanya file milik sendiri
  // stale-while-revalidate untuk app shell
  e.respondWith(
    caches.match(req).then(function (cached) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached || caches.match('./index.html'); });
      return cached || fresh;
    })
  );
});
