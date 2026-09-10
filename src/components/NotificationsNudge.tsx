"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentSubscription, isIos, isStandalone, pushSupported } from "@/lib/push-client";
import { IconCalendar, IconX } from "./Icons";

// Invite unique et rejetable à activer les notifications (audit UX UX-11) :
// l'opt-in est strict et sans aucune relance — le seul point d'entrée est
// « Mon compte », qu'on n'ouvre presque jamais. Affichée seulement si le
// push est réellement activable ici et pas déjà en place, et jamais
// ré-affichée après un rejet (drapeau localStorage).
const DISMISS_KEY = "checkberry:notif-nudge-dismissed";

export function NotificationsNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* stockage indisponible : on tente quand même l'affichage */
      }
      if (!pushSupported()) return;
      if (isIos() && !isStandalone()) return;
      if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
      const sub = await getCurrentSubscription();
      if (!cancelled && !sub) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* tant pis : le nudge réapparaîtra au prochain chargement */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft/50 p-3.5">
      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand text-white">
        <IconCalendar className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">Reste au courant</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
          Reçois une notification quand une tâche t&apos;est partagée, commentée, ou proche de son
          échéance.
        </p>
        <Link
          href="/compte"
          className="mt-2 inline-flex rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white"
        >
          Activer les notifications
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
