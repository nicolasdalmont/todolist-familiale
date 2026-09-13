"use client";

import { useEffect, useState } from "react";
import { APP_TIMEZONE } from "@/lib/timezone";

// Bandeau affiché quand l'appareil est hors ligne — pour que les données
// affichées (servies depuis le cache du service worker, voir public/sw.js
// v5) ne soient jamais confondues avec des données à jour : lecture seule
// uniquement, pas de file d'attente pour les mutations créées hors ligne
// (voir README, "Ce qui n'est pas encore implémenté").
//
// `navigator.onLine` seul n'est pas fiable (peut rester `true` sans accès
// réel à internet, ex. wifi captif) : on vérifie la connectivité réelle en
// interrogeant /api/version (déjà utilisé par AppUpdateWatcher.tsx, jamais
// mis en cache — voir ce fichier). L'horodatage de la dernière réponse
// reçue avec succès est gardé en localStorage pour survivre à un
// rechargement, et affiché dans le bandeau ("dernières données à HH:mm").
const LAST_SYNC_KEY = "checkberry:lastSync";

function readLastSync(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeLastSync(value: number) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(value));
  } catch {
    /* stockage indisponible : tant pis, l'horodatage ne sera pas affiché */
  }
}

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);

  useEffect(() => {
    setLastSync(readLastSync());
    let cancelled = false;

    async function checkConnectivity() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) throw new Error("réponse en erreur");
        if (cancelled) return;
        const now = Date.now();
        setOffline(false);
        setLastSync(now);
        writeLastSync(now);
      } catch {
        if (!cancelled) setOffline(true);
      }
    }

    // Retour immédiat sur les événements natifs (pas d'aller-retour réseau à
    // attendre pour signaler la perte de connexion), confirmé/affiné ensuite
    // par la vérification réelle ci-dessus.
    function handleOffline() {
      setOffline(true);
    }
    function handleOnline() {
      checkConnectivity();
    }
    function handleVisible() {
      if (document.visibilityState === "visible") checkConnectivity();
    }

    checkConnectivity();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", checkConnectivity);
    document.addEventListener("visibilitychange", handleVisible);
    const interval = window.setInterval(checkConnectivity, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", checkConnectivity);
      document.removeEventListener("visibilitychange", handleVisible);
      window.clearInterval(interval);
    };
  }, []);

  if (!offline) return null;

  const label = lastSync
    ? new Date(lastSync).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIMEZONE,
      })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-ink px-4 pb-2 text-center text-[12.5px] font-semibold text-white"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
    >
      Hors ligne{label ? ` — dernières données à ${label}` : ""}
    </div>
  );
}
