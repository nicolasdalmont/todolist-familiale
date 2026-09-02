"use client";

import { useEffect, useRef } from "react";

// Recharge automatiquement l'appli quand une nouvelle version a été
// déployée pendant qu'elle était restée ouverte — en particulier pour les
// personnes qui l'ont ajoutée à leur écran d'accueil (PWA) : une PWA reste
// souvent en mémoire d'une ouverture à l'autre sans jamais faire de vrai
// rechargement réseau, donc sans ça elle peut continuer à faire tourner un
// code JS obsolète indéfiniment, même si les correctifs de cache (voir
// next.config.mjs et public/sw.js) garantissent déjà que les *données*
// affichées, elles, sont toujours à jour.
//
// Principe : on retient la version chargée au démarrage (src/app/api/
// version), puis on la recompare à la version courante du serveur à chaque
// fois que l'appli redevient visible (icône ré-ouverte, onglet
// réactivé, retour au premier plan) — et on recharge la page si elles
// diffèrent. Volontairement indépendant du service worker : il n'a pas
// besoin que public/sw.js change pour détecter un nouveau déploiement,
// contrairement à la détection de mise à jour native des service workers.
export function AppUpdateWatcher() {
  const currentVersion = useRef<string | null>(null);
  const reloaded = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchBuildId(): Promise<string | null> {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { buildId?: unknown };
        return typeof data.buildId === "string" ? data.buildId : null;
      } catch {
        // Hors-ligne ou requête bloquée : on ne sait pas s'il y a une
        // nouvelle version, donc on ne fait rien plutôt que de risquer un
        // recharger intempestif.
        return null;
      }
    }

    async function checkForUpdate() {
      if (reloaded.current || document.visibilityState !== "visible") return;
      const latest = await fetchBuildId();
      if (cancelled || !latest || !currentVersion.current) return;
      if (latest !== currentVersion.current) {
        reloaded.current = true;
        window.location.reload();
      }
    }

    // Version de référence : celle en cours au moment où cet onglet a
    // chargé l'appli.
    fetchBuildId().then((id) => {
      if (!cancelled) currentVersion.current = id;
    });

    function handleVisible() {
      if (document.visibilityState === "visible") checkForUpdate();
    }

    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", checkForUpdate);
    // "pageshow" se déclenche aussi quand la page est restaurée depuis le
    // bfcache du navigateur (rouvrir la PWA sans rechargement réseau) — un
    // cas que "focus"/"visibilitychange" seuls peuvent manquer sur mobile.
    window.addEventListener("pageshow", checkForUpdate);
    // Filet de sécurité si l'appli reste au premier plan sans jamais
    // perdre le focus (rare, mais possible sur un écran resté allumé).
    const interval = window.setInterval(checkForUpdate, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", checkForUpdate);
      window.removeEventListener("pageshow", checkForUpdate);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
