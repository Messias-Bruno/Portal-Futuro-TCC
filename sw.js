/* Portal Futuro · service worker
   Rede primeiro: com internet, sempre a versão mais nova do site.
   Sem internet, a última cópia guardada (os guias continuam abrindo).
   Nada de outros sites é guardado (Supabase, vídeo, fontes). */
var CACHE = "portal-futuro-v1";
var SHELL = ["/", "/index.html", "/assets/css/style.css", "/assets/js/app.js", "/assets/js/config.js", "/assets/img/favicon.svg", "/assets/img/icon-192.png", "/manifest.webmanifest", "/404.html", "/assets/css/404.css"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === "basic") { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      if (req.mode === "navigate") return caches.match("/");
      return Response.error();
    });
  }));
});
