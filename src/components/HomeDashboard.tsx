"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ActivityLogEntry, Profile, Task } from "@/lib/types";
import { dateKeyFromDate, dateKeyFromIso, isOverdue, upcomingSunday } from "@/lib/format";
import { APP_TIMEZONE } from "@/lib/timezone";
import { ActivityFeed } from "./ActivityFeed";
import { IconAlertTriangle, IconArrowLeft, IconCalendar } from "./Icons";

// Calcule les trois compteurs "En retard" / "Aujourd'hui" / "Cette semaine"
// côté client (voir la note dans src/lib/format.ts sur le fuseau horaire) à
// partir de la liste complète des tâches déjà chargée côté serveur — aucun
// aller-retour réseau supplémentaire.
export function HomeDashboard({
  profile,
  tasks,
  activity,
}: {
  profile: Profile;
  tasks: Task[];
  activity: ActivityLogEntry[];
}) {
  const { todayCount, weekCount, overdueCount, todayKey, sundayKey, todayLabel } = useMemo(() => {
    const now = new Date();
    const todayKey = dateKeyFromDate(now);
    const sunday = upcomingSunday(now);
    const sundayKey = dateKeyFromDate(sunday);

    // "Tâches ouvertes" : ni terminées, ni archivées — aucun des trois
    // compteurs de l'accueil ne compte une tâche terminée ou archivée.
    const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");

    const todayCount = open.filter((t) => t.due_at && dateKeyFromIso(t.due_at) === todayKey).length;
    // "Cette semaine" = du jour même jusqu'à dimanche inclus (semaine
    // restante), et non l'ensemble lundi-dimanche : on regarde devant soi,
    // pas les jours déjà passés cette semaine.
    const weekCount = open.filter(
      (t) => t.due_at && dateKeyFromIso(t.due_at) >= todayKey && dateKeyFromIso(t.due_at) <= sundayKey
    ).length;
    // Même définition du retard que partout ailleurs dans l'appli (badge
    // "En retard" sur la carte de tâche et l'écran de détail — voir
    // isOverdue() dans src/lib/format.ts) : échéance dépassée et tâche ni
    // terminée ni archivée. isOverdue() exclut déjà "done"/"archived", donc
    // pas besoin de repartir de `open` ici.
    const overdueCount = tasks.filter((t) => isOverdue(t.due_at, t.status)).length;

    const todayLabel = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: APP_TIMEZONE,
    });

    return { todayCount, weekCount, overdueCount, todayKey, sundayKey, todayLabel: capitalize(todayLabel) };
  }, [tasks]);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div>
        <h1 className="text-[22px] font-extrabold text-ink">Bonjour, {profile.name}</h1>
        <p className="text-[13.5px] text-ink-muted">{todayLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Tuile "En retard" en pleine largeur : la plus urgente des trois,
            mise en avant en rouge dès qu'elle contient quelque chose — même
            palette que le badge "En retard" déjà utilisé sur la carte de
            tâche et l'écran de détail (voir src/components/Badge.tsx). */}
        <Link
          href="/tasks?overdue=1"
          className={`col-span-2 flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition ${
            overdueCount > 0
              ? "border-rose-200 bg-rose-50 hover:border-rose-300"
              : "border-line bg-surface hover:border-brand/50"
          }`}
        >
          <span
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
              overdueCount > 0 ? "bg-rose-100 text-rose-600" : "bg-brand-soft text-brand-dark"
            }`}
          >
            <IconAlertTriangle className="h-4 w-4" />
          </span>
          <span
            className={`text-[28px] font-extrabold leading-none ${overdueCount > 0 ? "text-rose-600" : "text-ink"}`}
          >
            {overdueCount}
          </span>
          <span
            className={`text-[13px] font-semibold ${overdueCount > 0 ? "text-rose-600" : "text-ink-muted"}`}
          >
            {overdueCount > 1 ? "Tâches en retard" : "Tâche en retard"}
          </span>
        </Link>

        <Link
          href={`/tasks?dueAtMost=${todayKey}`}
          className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-brand/50"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
            <IconCalendar className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-[22px] font-extrabold leading-none text-ink">{todayCount}</span>
            <span className="text-[12px] font-semibold leading-snug text-ink-muted">
              {todayCount > 1 ? "Tâches dues aujourd'hui" : "Tâche due aujourd'hui"}
            </span>
          </span>
        </Link>

        <Link
          href={`/tasks?dueAtMost=${sundayKey}`}
          className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-brand/50"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
            <IconCalendar className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-[22px] font-extrabold leading-none text-ink">{weekCount}</span>
            <span className="text-[12px] font-semibold leading-snug text-ink-muted">Dues cette semaine</span>
          </span>
        </Link>
      </div>

      <ActivityFeed activities={activity} currentUserId={profile.id} />

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
