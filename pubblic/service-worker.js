// Cache semplice per le pagine principali
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("assenze-cache-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/login",
        "/register",
        "/manifest.json"
      ]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // se è già in cache, usa quella
      if (response) return response;
      // altrimenti scarica dalla rete
      return fetch(event.request);
    })
  );
});
