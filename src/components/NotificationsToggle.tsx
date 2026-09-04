"use client";

import { useEffect, useState } from "react";
import {
  getCurrentSubscription,
  isIos,
  isStandalone,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

// Bouton d'activation des notifications push sur l'écran "Mon compte"
// (src/app/compte/page.tsx). Opt-in strict, par appareil : rien n'est
// activé par défaut (voir la feuille de route notifications) — cet écran
// est le seul endroit où une personne peut les activer, sur l'appareil
// depuis lequel elle le fait.
type Status = "checking" | "unsupported" | "ios-not-installed" | "denied" | "off" | "on";

export function NotificationsToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!pushSupported()) {
        setStatus(isIos() ? "ios-not-installed" : "unsupported");
        return;
      }
      if (isIos() && !isStandalone()) {
        setStatus("ios-not-installed");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const sub = await getCurrentSubscription();
      if (!cancelled) setStatus(sub ? "on" : "off");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setBusy(true);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Notifications indisponibles pour l'instant.");
      await subscribeToPush(key);
      setStatus("on");
    } catch (e) {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
      setError(e instanceof Error ? e.message : "Impossible d'activer les notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setStatus("off");
    } catch {
      setError("Impossible de désactiver les notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <p className="text-[13px] text-ink-muted">
        Les notifications ne sont pas prises en charge par ce navigateur.
      </p>
    );
  }

  if (status === "ios-not-installed") {
    return (
      <p className="text-[13px] text-ink-muted">
        Sur iPhone/iPad : ajoute d&apos;abord l&apos;appli à l&apos;écran d&apos;accueil (bouton Partager →
        « Sur l&apos;écran d&apos;accueil »), puis reviens ici depuis l&apos;icône installée pour activer
        les notifications.
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-[13px] text-ink-muted">
        Notifications bloquées dans les réglages de ton navigateur pour cette appli — réactive-les
        depuis les réglages du site, puis reviens ici.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-semibold text-ink">
            {status === "on" ? "Activées sur cet appareil" : "Désactivées sur cet appareil"}
          </div>
          <p className="text-[12px] text-ink-muted">
            Partage d&apos;une tâche, nouveau commentaire ou changement de statut te concernant.
          </p>
        </div>
        <button
          type="button"
          onClick={status === "on" ? disable : enable}
          disabled={busy}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50 ${
            status === "on" ? "border border-line text-ink-muted" : "bg-brand text-white"
          }`}
        >
          {busy ? "..." : status === "on" ? "Désactiver" : "Activer"}
        </button>
      </div>
      {error ? <p className="text-[12.5px] font-semibold text-rose-600">{error}</p> : null}
    </div>
  );
}
