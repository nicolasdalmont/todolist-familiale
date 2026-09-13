"use client";

import { signOutAction } from "@/lib/actions";
import { FormPendingBridge } from "@/components/PendingOverlay";
import { IconPower } from "./Icons";

// Vide le cache hors-ligne de lecture (public/sw.js v5) à la déconnexion :
// sur un appareil partagé entre plusieurs membres de la famille, sans ça
// les données du compte qui se déconnecte resteraient consultables hors
// ligne par la personne suivante qui ouvre l'appli (voir doc technique
// §8.4 pour un précédent de faille de confidentialité sur ce même genre de
// risque). Le cache de l'app shell (icônes/manifest, pas de données
// personnelles) est volontairement conservé. Best-effort, non bloquant :
// la déconnexion elle-même ne doit pas dépendre de cette étape.
function clearOfflineCache() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("checkberry-pages") || key.startsWith("checkberry-static"))
          .map((key) => caches.delete(key))
      )
    )
    .catch(() => {});
}

export function LogoutButton() {
  return (
    <form action={signOutAction} onSubmit={clearOfflineCache}>
      <FormPendingBridge />
      <button
        type="submit"
        title="Se déconnecter"
        aria-label="Se déconnecter"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
      >
        <IconPower className="h-[18px] w-[18px]" />
      </button>
    </form>
  );
}
