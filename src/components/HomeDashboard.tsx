"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Profile, Task } from "@/lib/types";
import { dateKeyFromDate, dateKeyFromIso, upcomingSunday } from "@/lib/format";
import { IconArrowLeft, IconCalendar } from "./Icons";

// Calcule les deux compteurs "Aujourd'hui" / "Cette semaine" côté client
// (voir la note dans src/lib/format.ts sur le fuseau horaire) à partir de
// la liste complète des tâches déjà chargée côté serveur — aucun aller-
// retour réseau supplémentaire.
export function HomeDashboard({ profile, tasks }: { profile: Profile; tasks: Task[] }) {
  const { todayCount, weekCount, todayKey, sundayKey, todayLabel } = useMemo(() => {
    const now = new Date();
    const todayKey = dateKeyFromDate(now);
    const sunday = upcomingSunday(now);
    const sundayKey = dateKeyFromDate(sunday);

    // "Tâches ouvertes" : ni terminées, ni archivées.
    const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");

    const todayCount = open.filter((t) => t.due_at && dateKeyFromIso(t.due_at) === todayKey).length;
    // "Cette semaine" = du jour même jusqu'à dimanche inclus (semaine
    // restante), et non l'ensemble lundi-dimanche : on regarde devant soi,
    // pas les jours déjà passés cette semaine.
    const weekCount = open.filter(
      (t) => t.due_at && dateKeyFromIso(t.due_at) >= todayKey && dateKeyFromIso(t.due_at) <= sundayKey
    ).length;

    const todayLabel = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

    return { todayCount, weekCount, todayKey, sundayKey, todayLabel: capitalize(todayLabel) };
  }, [tasks]);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Bonjour, {profile.name}</h1>
        <p className="text-[13.5px] text-ink-muted">{todayLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/tasks?dueAtMost=${todayKey}`}
          className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-brand/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
            <IconCalendar className="h-4 w-4" />
          </span>
          <span className="text-[28px] font-extrabold leading-none text-ink">{todayCount}</span>
          <span className="text-[13px] font-semibold text-ink-muted">
            {todayCount > 1 ? "Tâches dues aujourd'hui" : "Tâche due aujourd'hui"}
          </span>
        </Link>

        <Link
          href={`/tasks?dueAtMost=${sundayKey}`}
          className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-brand/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
            <IconCalendar className="h-4 w-4" />
          </span>
          <span className="text-[28px] font-extrabold leading-none text-ink">{weekCount}</span>
          <span className="text-[13px] font-semibold text-ink-muted">Dues cette semaine (dim.)</span>
        </Link>
      </div>

      <Link
        href="/tasks"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2.5 text-[13.5px] font-bold text-ink-muted hover:border-brand/50 hover:text-ink"
      >
        Voir toutes les tâches <IconArrowLeft className="h-3.5 w-3.5 rotate-180" />
      </Link>
    </div>
  );
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
