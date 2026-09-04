// Service worker minimal : met en cache l'app shell (icônes + manifest, pour
// l'installabilité PWA) uniquement. La synchronisation offline avancée
// (file d'attente IndexedDB des mutations créées hors-ligne) est prévue en
// phase ultérieure — voir le README du dépôt.
//
// v2 (02/09/2026) — bug corrigé : la version précédente mettait en cache
// TOUTES les requêtes GET (y compris "/", "/tasks", "/tasks/[id]", et les
// requêtes de données RSC de Next.js pour ces pages), avec une stratégie
// "cache d'abord" (`cached || network`) : la page était donc systématiquement
// resservie depuis un instantané périmé, la réponse réseau ne mettant à jour
// le cache que pour la *prochaine* navigation. Résultat observé : après avoir
// créé/modifié/supprimé une tâche, il fallait recharger la page (parfois deux
// fois) pour voir le changement — un 4e piège de cache, cette fois au niveau
// du Service Worker, distinct des 3 pièges Next.js déjà corrigés (voir
// claude/prototype-notes.md). Correctif : seuls les fichiers strictement
// statiques de l'app shell (manifest + icônes) sont mis en cache ; toute
// autre requête (page ou donnée) passe toujours par le réseau, jamais par le
// cache. Le nom de cache change (v1 → v2) pour purger l'ancien cache
// fautif chez les utilisateurs déjà installés (voir l'écoute "activate").
const CACHE_NAME = "todo-familiale-shell-v2";
const APP_SHELL = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
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
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isShellAsset = APP_SHELL.includes(url.pathname);

  // Toute requête qui n'est pas un des quelques fichiers statiques listés
  // ci-dessus (pages, données RSC, tout ce qui affiche des tâches) doit
  // toujours passer par le réseau : ne pas appeler respondWith() laisse le
  // navigateur gérer la requête normalement, sans jamais consulter le cache.
  if (!isShellAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// --- Notifications push web (04/09/2026) -----------------------------
//
// Voir doc technique §6.15 : envoyées par sendPushToUser() (src/lib/
// push.ts) via le protocole Web Push standard, payload JSON
// { title, body?, url }. L'abonnement (activé depuis l'écran "Mon
// compte") est géré côté client dans src/lib/push-client.ts, enregistré
// via la Route Handler /api/push/subscribe (pas une Server Action : ce
// fichier tourne hors du runtime React, il ne peut en invoquer aucune).

self.addEventListener("push", (event) => {
  let payload = { title: "To-Do List Familiale", body: "", url: "/" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body || undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url || "/" },
      });
      // Pastille sur l'icône de l'appli (PWA installée — Android/desktop
      // "en clair", iOS 16.4+ installé). Appelée sans argument : indique
      // juste "il y a du nouveau" (un point sur la plupart des launchers),
      // pas de compte exact — voir la feuille de route notifications pour
      // la nuance. Best-effort : ignoré silencieusement si non supporté.
      if ("setAppBadge" in self.navigator) {
        self.navigator.setAppBadge().catch(() => {});
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin).href;

      for (const client of allClients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ("navigate" in client) {
          await client.navigate(target).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

// Rotation d'abonnement déclenchée par le navigateur (rare). Best-effort :
// si le réabonnement échoue, l'ancien restera simplement mort et sera
// purgé par sendPushToUser() au prochain envoi (réponse 404/410).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldOptions = event.oldSubscription && event.oldSubscription.options;
        const subscription = await self.registration.pushManager.subscribe(
          oldOptions ? { userVisibleOnly: true, applicationServerKey: oldOptions.applicationServerKey } : { userVisibleOnly: true }
        );
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // Rien à faire de plus : voir le commentaire ci-dessus.
      }
    })()
  );
});
