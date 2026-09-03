"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ActivityLogEntry, ActivityType } from "@/lib/types";
import { dateKeyFromDate, dateKeyFromIso, relativeTime } from "@/lib/format";
import { Avatar } from "./Avatar";
import { IconCheck, IconChat, IconChecklist, IconPencil, IconPlus } from "./Icons";

// Fil "Activité du jour" affiché sous les compteurs de l'écran d'accueil
// (voir src/components/HomeDashboard.tsx) : les actions faites aujourd'hui
// par les autres membres de la famille sur des tâches que je partage avec
// eux (créées par moi et partagées, ou partagées avec moi) — voir
// getRecentActivity() dans src/lib/queries.ts et logActivity() dans
// src/lib/actions.ts pour l'écriture.
//
// Deux traitements volontairement faits ici, côté client, plutôt que dans
// la requête serveur :
// - Le filtre "aujourd'hui" (clé de date locale, même principe que les
//   compteurs — voir la note sur le fuseau horaire dans src/lib/format.ts)
//   et l'exclusion de mes propres actions (pas la peine de m'informer de ce
//   que je viens de faire moi-même).
// - Le regroupement : plusieurs actions identiques de la même personne sur
//   la même tâche le même jour (ex. cocher 3 items de checklist l'un après
//   l'autre) tiennent en une seule ligne ("a coché 3 éléments...") plutôt
//   que de noyer le fil.

type ActivityGroup = {
  key: string;
  actor: NonNullable<ActivityLogEntry["actor"]>;
  type: ActivityType;
  taskId: string;
  taskTitle: string;
  count: number;
  latestCreatedAt: string;
  latestDetail: string | null;
};

const TYPE_ICON: Record<ActivityType, typeof IconPlus> = {
  task_created: IconPlus,
  task_updated: IconPencil,
  status_changed: IconCheck,
  comment_added: IconChat,
  comment_deleted: IconChat,
  checklist_item_added: IconChecklist,
  checklist_item_checked: IconChecklist,
  checklist_item_unchecked: IconChecklist,
  checklist_item_removed: IconChecklist,
};

function messageFor(group: ActivityGroup): string {
  const { type, actor, taskTitle, count, latestDetail } = group;
  const name = actor.name;
  const plural = count > 1;

  switch (type) {
    case "task_created":
      return `${name} a partagé ${plural ? `${count} nouvelles tâches` : "1 nouvelle tâche"} avec vous : ${taskTitle}`;
    case "task_updated":
      return `${name} a modifié la tâche${plural ? ` (${count} fois)` : ""} : ${taskTitle}`;
    case "status_changed":
      return `${name} a changé le statut de la tâche ${taskTitle}${latestDetail ? ` en « ${latestDetail} »` : ""}`;
    case "comment_added":
      return plural
        ? `${name} a ajouté ${count} commentaires à la tâche ${taskTitle}`
        : `${name} a commenté la tâche ${taskTitle}`;
    case "comment_deleted":
      return plural
        ? `${name} a supprimé ${count} commentaires de la tâche ${taskTitle}`
        : `${name} a supprimé un commentaire de la tâche ${taskTitle}`;
    case "checklist_item_added":
      return `${name} a ajouté ${plural ? `${count} éléments` : "un élément"} à la checklist de la tâche ${taskTitle}`;
    case "checklist_item_checked":
      return `${name} a coché ${plural ? `${count} éléments` : "un élément"} de la checklist de la tâche ${taskTitle}`;
    case "checklist_item_unchecked":
      return `${name} a décoché ${plural ? `${count} éléments` : "un élément"} de la checklist de la tâche ${taskTitle}`;
    case "checklist_item_removed":
      return `${name} a supprimé ${plural ? `${count} éléments` : "un élément"} de la checklist de la tâche ${taskTitle}`;
    default:
      return `${name} a modifié la tâche ${taskTitle}`;
  }
}

export function ActivityFeed({
  activities,
  currentUserId,
}: {
  activities: ActivityLogEntry[];
  currentUserId: string;
}) {
  const groups = useMemo(() => {
    const todayKey = dateKeyFromDate(new Date());

    const todays = activities.filter(
      (a) => a.actor != null && a.actor_id !== currentUserId && dateKeyFromIso(a.created_at) === todayKey
    );

    const map = new Map<string, ActivityGroup>();
    for (const entry of todays) {
      const key = `${entry.actor_id}|${entry.type}|${entry.task_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (entry.created_at > existing.latestCreatedAt) {
          existing.latestCreatedAt = entry.created_at;
          existing.latestDetail = entry.detail;
        }
      } else {
        map.set(key, {
          key,
          actor: entry.actor!,
          type: entry.type,
          taskId: entry.task_id,
          taskTitle: entry.task_title,
          count: 1,
          latestCreatedAt: entry.created_at,
          latestDetail: entry.detail,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => (a.latestCreatedAt < b.latestCreatedAt ? 1 : -1));
  }, [activities, currentUserId]);

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[13.5px] font-bold text-ink-muted">Activité du jour</h2>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted">
          Aucune activité partagée aujourd&apos;hui.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const Icon = TYPE_ICON[group.type];
            return (
              <Link
                key={group.key}
                href={`/tasks/${group.taskId}`}
                className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-sm transition hover:border-brand/50"
              >
                <Avatar profile={group.actor} size="sm" />
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-[13px] leading-snug text-ink">{messageFor(group)}</span>
                <span className="flex-shrink-0 pt-0.5 text-[11.5px] text-ink-muted">
                  {relativeTime(group.latestCreatedAt)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
