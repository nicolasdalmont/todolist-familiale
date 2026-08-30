"use client";

import { useEffect } from "react";

// Enregistre le service worker pour l'installabilité PWA et le cache de
// l'app shell. La synchronisation offline avancée (IndexedDB) reste à
// construire (voir README).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Échec de l'enregistrement du service worker :", err);
      });
    }
  }, []);

  return null;
}
