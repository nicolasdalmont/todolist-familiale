"use client";

import { useEffect } from "react";

// Enregistre le service worker pour l'installabilité PWA et le cache de
// l'app shell. La synchronisation offline avancée (IndexedDB) reste à
// construire (voir README).
//
// Le rafraîchissement systématique de l'appli à l'ouverture (nouveau
// déploiement Vercel détecté) est géré par AppUpdateWatcher.tsx, monté à
// côté de ce composant dans layout.tsx — volontairement indépendant du
// service worker, car public/sw.js ne change pas à chaque déploiement de
// l'appli. On profite quand même de la présence de cet enregistrement pour
// aussi vérifier une éventuelle mise à jour du service worker lui-même
// (utile si public/sw.js change un jour) à chaque retour au premier plan :
// `registration.update()` force le navigateur à revérifier /sw.js sans
// attendre son cycle de vérification habituel (jusqu'à 24h) — d'autant
// plus efficace ici que /sw.js est déjà servi avec un en-tête
// Cache-Control: no-cache (voir next.config.mjs).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        function checkForUpdate() {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        }
        document.addEventListener("visibilitychange", checkForUpdate);
        window.addEventListener("focus", checkForUpdate);
      })
      .catch((err) => {
        console.warn("Échec de l'enregistrement du service worker :", err);
      });
  }, []);

  return null;
}
