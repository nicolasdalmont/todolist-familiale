"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppSettings } from "@/lib/types";
import { setReminderEnabledAction } from "@/lib/settings-actions";
import { APP_NAME, APP_TIMEZONE } from "@/lib/app-config";
import { useToast } from "@/components/Toast";

// Onglet « Réglages » de l'écran admin (voir AdminScreen.tsx et 6.9).
// Réglage modifiable en base : activation du rappel d'échéance. Le reste
// (nom, fuseau) est fixé au déploiement (variables d'environnement) et
// affiché ici en lecture seule pour guider un nouveau déploiement.
export function SettingsPanel({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings.reminderEnabled);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setReminderEnabledAction(next);
      if (res.error) {
        setEnabled(!next);
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      toast.show({ message: next ? "Rappel activé" : "Rappel désactivé", tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">Rappel d&apos;échéance</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
              Notification quotidienne aux personnes concernées par une tâche qui échoit le jour même
              (in-app + push).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={isPending}
            onClick={toggle}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
              enabled ? "bg-brand" : "bg-line-strong"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                enabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
        <p className="mt-2.5 border-t border-line-soft pt-2.5 text-[12px] text-ink-muted">
          L&apos;heure d&apos;envoi est fixée par le <code className="font-mono">schedule</code> du cron
          dans <code className="font-mono">vercel.json</code> (un envoi par jour).
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold">Informations d&apos;instance</h3>
        <dl className="flex flex-col gap-2.5 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Nom de l&apos;application</dt>
            <dd className="font-semibold text-ink">{APP_NAME}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Fuseau horaire</dt>
            <dd className="font-mono font-semibold text-ink">{APP_TIMEZONE}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-line-soft pt-2.5 text-[12px] leading-snug text-ink-muted">
          Modifiables via les variables d&apos;environnement
          <code className="mx-1 font-mono">NEXT_PUBLIC_APP_NAME</code> et
          <code className="mx-1 font-mono">NEXT_PUBLIC_APP_TIMEZONE</code> (nom IANA, ex.
          <code className="mx-1 font-mono">America/Montreal</code>), suivi d&apos;un redéploiement.
        </p>
      </section>
    </div>
  );
}
