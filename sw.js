// Service worker minimal : met en cache l'app shell pour permettre
// l'installation et une première ébauche de fonctionnement hors-ligne.
// NOTE (prototype) : la synchronisation des données (IndexedDB + moteur de
// réconciliation) prévue en Phase 3 du cahier des charges n'est pas encore
// implémentée ici — les tâches sont pour l'instant stockées en localStorage,
// ce qui fonctionne hors-ligne mais sans synchronisation multi-appareils.

const CACHE_NAME = "todo-familiale-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/store.js",
  "./js/helpers.js",
  "./js/views/login.js",
  "./js/views/dashboard.js",
  "./js/views/task-form.js",
  "./js/views/task-detail.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
