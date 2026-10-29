/* Portal Futuro · service worker
   Rede primeiro: com internet, sempre a versão mais nova do site.
   Sem internet, a última cópia guardada (os guias continuam abrindo).
   Nada de outros sites é guardado (Supabase, vídeo, fontes).
   Também mostra as notificações do aplicativo instalado (lembretes e novidades). */
var CACHE = "portal-futuro-v16";
var SHELL = ["/", "/index.html", "/assets/css/style.css", "/assets/js/app.js", "/assets/js/config.js", "/assets/js/early.js", "/assets/img/favicon.svg", "/assets/img/icon-192.png", "/assets/img/notif-vazio.png", "/manifest.webmanifest", "/404.html", "/assets/css/404.css"];
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

// Notificações: o servidor manda título, texto e a página que deve abrir (sempre deste site)
function safeUrl(u) { return typeof u === "string" && /^\/[A-Za-z0-9#\/_-]*$/.test(u) ? u : "/"; }
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  var title = String(d.title || "Portal Futuro").slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 200),
    icon: "/assets/img/notif-vazio.png", // imagem transparente: sem ela, alguns Android desenham uma letra no lugar
    badge: "/assets/img/badge-96.png",
    tag: typeof d.tag === "string" ? d.tag.slice(0, 60) : undefined,
    lang: "pt-BR",
    data: { url: safeUrl(d.url) }
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL(safeUrl(e.notification.data && e.notification.data.url), self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (new URL(c.url).origin === self.location.origin && "focus" in c) { return c.focus().then(function (w) { return w && "navigate" in w ? w.navigate(url) : w; }); }
    }
    return self.clients.openWindow(url);
  }));
});
