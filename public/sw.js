// Service worker : app shell (icônes + manifest, pour l'installabilité PWA)
// + notifications push + cache de lecture hors-ligne (pages déjà visitées).
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
// v3 (04/09/2026) : renommage en « Checkberry » + nouveau thème rose —
// manifest et icônes de l'app shell ont changé, le nom de cache change
// donc pour purger l'ancien chez les PWA déjà installées.
// v4 (10/09/2026) : le manifest est désormais généré
// (/manifest.webmanifest, voir src/app/manifest.ts) — l'URL cachée change.
// v5 (13/09/2026) : lecture hors-ligne a minima. Les pages/données déjà
// vues en ligne (navigations + requêtes RSC de Next.js) sont maintenant
// mises en cache en repli — "réseau d'abord, cache si le réseau échoue" —
// dans un cache séparé de l'app shell, avec un fallback affiché si la page
// n'a jamais été visitée. Toujours PAS de file d'attente pour les mutations
// créées hors-ligne (voir README) : uniquement de la consultation.
const CACHE_NAME = "checkberry-shell-v5";
const PAGE_CACHE_NAME = "checkberry-pages-v1";
const STATIC_CACHE_NAME = "checkberry-static-v1";
const APP_SHELL = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"];
const ALL_CACHES = [CACHE_NAME, PAGE_CACHE_NAME, STATIC_CACHE_NAME];

// Jamais mis en cache, jamais servi depuis le cache même hors ligne :
// - /api/* : session, push, cron, export ICS... des endpoints qui doivent
//   soit toujours refléter l'état réel, soit échouer franchement plutôt que
//   renvoyer une réponse périmée (ex. /api/version, utilisé par
//   AppUpdateWatcher.tsx pour détecter un nouveau déploiement).
// - /login : servir une version en cache pourrait figer un état de flux de
//   connexion périmé (ex. "définir son mot de passe" alors qu'il l'est déjà,
//   voir le commentaire "force-dynamic" de cette page).
function isNeverCache(pathname) {
  return pathname.startsWith("/api/") || pathname === "/login" || pathname.startsWith("/login/");
}

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
      .then((keys) => Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isShellAsset = APP_SHELL.includes(url.pathname);

  if (isShellAsset) {
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
    return;
  }

  if (isNeverCache(url.pathname)) return;

  // Fichiers statiques Next.js (JS/CSS des chunks buildés) : nommés avec un
  // hash de contenu, donc immuables — cache d'abord, sans jamais revalider,
  // pour que les pages déjà vues restent utilisables (et interactives) hors
  // ligne même après plusieurs jours sans connexion.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Pages et requêtes de données RSC de Next.js : réseau d'abord (jamais de
  // contenu périmé tant qu'il y a du réseau, cf. le piège corrigé en v2
  // ci-dessus), repli sur la dernière version mise en cache uniquement si le
  // réseau échoue (hors ligne). Si la page n'a jamais été visitée en ligne,
  // repli sur une page de secours pour les navigations complètes.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(PAGE_CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const fallback = await caches.match("/offline.html");
          if (fallback) return fallback;
        }
        return Response.error();
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
  let payload = { title: "Checkberry", body: "", url: "/", badgeCount: undefined };
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
      // Pastille sur l'icône de l'appli (PWA installée — Android/desktop,
      // iOS 16.4+ installé) : notifications non lues + tâches en retard,
      // calculé côté serveur au moment de l'envoi (getBadgeCount(), voir
      // src/lib/queries.ts et src/lib/push.ts). Si ce calcul a échoué,
      // payload.badgeCount est absent : setAppBadge() sans argument se
      // rabat alors sur un indicateur générique ("il y a du nouveau", un
      // point sur la plupart des launchers) plutôt que rien du tout.
      // Best-effort : l'échec ne doit jamais empêcher l'affichage de la
      // notification ci-dessus (déjà passée). try/catch plutôt qu'un
      // simple .catch() : certaines implémentations peuvent lever une
      // exception synchrone plutôt que renvoyer une promesse rejetée.
      // Le message reste loggué (visible seulement via l'inspecteur Web
      // distant de Safari, Réglages > Safari > Avancé > Inspecteur Web,
      // puis Mac > Safari > Développer) plutôt qu'avalé en silence.
      if ("setAppBadge" in self.navigator) {
        try {
          await self.navigator.setAppBadge(payload.badgeCount);
        } catch (err) {
          console.error("setAppBadge (push):", err);
        }
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
