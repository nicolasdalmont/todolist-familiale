"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import type { ActivityLogEntry, ChallengeProgress, NotificationItem, Profile, RewardAchievement, Task, WeeklyChallenge } from "@/lib/types";
import { computeBadgeCount } from "@/lib/badge";
import { dateKeyFromDate, dateKeyFromIso, isOverdue, upcomingSunday } from "@/lib/format";
import { APP_TIMEZONE } from "@/lib/timezone";
import { canEdit } from "@/lib/access";
import { ActivityFeed } from "./ActivityFeed";
import { AttentionFeed } from "./AttentionFeed";
import { StreakBadge } from "./Badge";
import { ChallengeCard } from "./ChallengeCard";
import { NotificationsNudge } from "./NotificationsNudge";
import { RewardsBoard } from "./RewardsBoard";
import { SharedWithYouFeed } from "./SharedWithYouFeed";
import { IconAlertTriangle, IconArrowLeft, IconCalendar } from "./Icons";

// Calcule les trois compteurs "En retard" / "Aujourd'hui" / "Cette semaine"
// côté client (voir la note dans src/lib/format.ts sur le fuseau horaire) à
// partir de la liste complète des tâches déjà chargée côté serveur — aucun
// aller-retour réseau supplémentaire.
export function HomeDashboard({
  profile,
  tasks,
  activity,
  notifications,
  challenge,
  streak,
  achievements,
}: {
  profile: Profile;
  tasks: Task[];
  activity: ActivityLogEntry[];
  notifications: NotificationItem[];
  challenge: { challenge: WeeklyChallenge; progress: ChallengeProgress } | null;
  streak: number;
  achievements: RewardAchievement[];
}) {
  const { todayCount, weekCount, overdueCount, overdueTaskIds, todayKey, sundayKey, todayLabel, greeting } = useMemo(() => {
    const now = new Date();
    const todayKey = dateKeyFromDate(now);
    const sunday = upcomingSunday(now);
    const sundayKey = dateKeyFromDate(sunday);

    // Les trois compteurs ne portent que sur les tâches dont je suis
    // responsable — créées par moi, ou partagées avec moi avec droit de
    // modification ("Assigné(e)", voir TaskForm.tsx) — jamais celles où je
    // suis seulement en lecture seule ("Lecture seule") : je ne peux de
    // toute façon pas les traiter, les compter donne un chiffre qui ne
    // correspond à rien d'actionnable. Même définition que canEdit()
    // (src/lib/access.ts, aussi utilisée pour les boutons de statut et le
    // lien "modifier"), pour rester cohérent avec la portée par défaut
    // "mes tâches" de la liste (TaskFilterList.tsx) — comportement corrigé
    // le 04/09/2026 après un signalement : le compteur "En retard" comptait
    // une tâche en lecture seule que la liste, elle, n'affichait pas par
    // défaut.
    const mine = tasks.filter((t) => canEdit(t, profile.id));

    // "Tâches ouvertes" : ni terminées, ni archivées — aucun des trois
    // compteurs de l'accueil ne compte une tâche terminée ou archivée.
    const open = mine.filter((t) => t.status === "todo" || t.status === "in_progress");

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
    const overdueTaskIds = mine.filter((t) => isOverdue(t.due_at, t.status)).map((t) => t.id);
    const overdueCount = overdueTaskIds.length;

    const todayLabel = now.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: APP_TIMEZONE,
    });

    // Salutation selon l'heure de Paris (audit UX UX-14) : « Bonsoir » à
    // partir de 18 h et jusqu'à 5 h, « Bonjour » le reste de la journée.
    const parisHour = Number(
      new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIMEZONE, hour: "2-digit", hour12: false }).format(now)
    );
    const greeting = parisHour >= 18 || parisHour < 5 ? "Bonsoir" : "Bonjour";

    return {
      todayCount,
      weekCount,
      overdueCount,
      overdueTaskIds,
      todayKey,
      sundayKey,
      todayLabel: capitalize(todayLabel),
      greeting,
    };
  }, [tasks, profile.id]);

  // Évènements déjà couverts par une notification non lue de « À ton
  // attention » : on ne les re-montre pas dans « Activité du jour »
  // (audit UX INC-7). `${task_id}|${type d'activité correspondant}`.
  const hiddenActivityKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const n of notifications) {
      if (!n.task_id) continue;
      if (n.type === "comment_added") keys.add(`${n.task_id}|comment_added`);
      if (n.type === "task_shared") {
        keys.add(`${n.task_id}|task_created`);
        keys.add(`${n.task_id}|task_updated`);
      }
    }
    return keys;
  }, [notifications]);

  // Tâches partagées avec moi en **lecture seule** (audit UX UX-12) :
  // exclues des compteurs et de la portée par défaut de la liste, donc
  // quasi invisibles autrement. Liste pérenne — on garde toutes les
  // tâches ouvertes (à faire / en cours), y compris en retard ; seules
  // les terminées / archivées sont écartées.
  const sharedForInfo = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !canEdit(t, profile.id) && (t.status === "todo" || t.status === "in_progress")
        )
        .map((t) => ({
          id: t.id,
          title: t.title,
          dueAt: t.due_at,
          overdue: isOverdue(t.due_at, t.status),
          by: (t.assignees ?? []).find((a) => a.id === t.created_by)?.name ?? null,
        })),
    [tasks, profile.id]
  );

  // Pose la pastille sur l'icône de l'appli (App Badging API — voir aussi
  // le handler "push" de public/sw.js, qui la met à jour de son côté à
  // chaque notification reçue) : notifications "À ton attention" non lues
  // + tâches en retard, dédoublonnées par tâche (computeBadgeCount(),
  // src/lib/badge.ts) — même calcul que getBadgeCount() côté serveur
  // (src/lib/queries.ts), pour que push et badge in-app affichent toujours
  // le même chiffre. Recalculée à chaque arrivée sur l'accueil, donc remise
  // à jour dès qu'on a lu les notifications ou traité les tâches en retard.
  // Best-effort, ignoré si l'API n'est pas supportée.
  useEffect(() => {
    // `notifications` ne contient que les non lues (getMyNotifications les
    // filtre déjà).
    const total = computeBadgeCount(overdueTaskIds, notifications);
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    // Best-effort : loggué plutôt qu'avalé en silence si l'appel échoue
    // (utile pour un diagnostic via l'inspecteur Web distant de Safari).
    const action = total > 0 ? nav.setAppBadge?.(total) : nav.clearAppBadge?.();
    action?.catch((err) => console.error("setAppBadge (accueil) :", err));
  }, [overdueTaskIds, notifications]);

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-ink">
          {greeting}, {profile.name}
          {streak > 0 ? <StreakBadge streak={streak} /> : null}
        </h1>
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
              ? "border-red-200 bg-red-50 hover:border-red-300"
              : "border-line bg-surface hover:border-brand/50"
          }`}
        >
          <span
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
              overdueCount > 0 ? "bg-red-100 text-red-600" : "bg-brand-soft text-brand-dark"
            }`}
          >
            <IconAlertTriangle className="h-4 w-4" />
          </span>
          <span
            className={`text-[28px] font-extrabold leading-none ${overdueCount > 0 ? "text-red-600" : "text-ink"}`}
          >
            {overdueCount}
          </span>
          <span
            className={`text-[13px] font-semibold ${overdueCount > 0 ? "text-red-600" : "text-ink-muted"}`}
          >
            {overdueCount > 1 ? "Tâches en retard" : "Tâche en retard"}
          </span>
        </Link>

        <Link
          href={`/tasks?dueFrom=${todayKey}&dueAtMost=${todayKey}`}
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
          href={`/tasks?dueFrom=${todayKey}&dueAtMost=${sundayKey}`}
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

      {challenge ? <ChallengeCard challenge={challenge.challenge} progress={challenge.progress} /> : null}

      <RewardsBoard achievements={achievements} />

      <NotificationsNudge />

      <AttentionFeed notifications={notifications} />

      <SharedWithYouFeed tasks={sharedForInfo} />

      <ActivityFeed activities={activity} currentUserId={profile.id} hiddenKeys={hiddenActivityKeys} />

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
