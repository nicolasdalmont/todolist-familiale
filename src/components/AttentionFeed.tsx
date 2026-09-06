"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationItem, NotificationType } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { markNotificationReadAction, markNotificationsReadAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { IconCalendar, IconChat, IconCheck, IconPencil, IconUsers, IconX } from "./Icons";

// Fil « À ton attention » affiché sous les compteurs de l'écran d'accueil
// (src/components/HomeDashboard.tsx) : le miroir in-app des notifications
// (tâche partagée avec moi, commentaire sur une tâche que je vois,
// changement de statut, échéance proche). Alimenté par getMyNotifications()
// (src/lib/queries.ts), qui ne renvoie **que les notifications non lues** :
// une notif marquée lue disparaît du fil, et la section entière disparaît
// quand il n'y a plus rien à lire. Deux façons de marquer lu : le bouton ✓
// sur chaque ligne, ou le clic sur la notification (qui va aussi à la
// tâche concernée) ; plus « Tout marquer comme lu » pour vider d'un coup.

const TYPE_ICON: Record<NotificationType, typeof IconChat> = {
  task_shared: IconUsers,
  task_updated: IconPencil,
  task_deleted: IconX,
  comment_added: IconChat,
  status_changed: IconCheck,
  due_soon: IconCalendar,
};

export function AttentionFeed({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [isMarkingAll, startMarkAll] = useGlobalTransition();
  // useTransition local (pas le gel d'écran global) : marquer une seule
  // notif lue est une micro-action, inutile de figer toute la page.
  const [isDismissing, startDismiss] = useTransition();

  if (notifications.length === 0) return null;

  function markAllRead() {
    startMarkAll(async () => {
      await markNotificationsReadAction();
      router.refresh();
    });
  }

  function dismiss(id: string) {
    startDismiss(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-muted">
          À ton attention
          <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold leading-[18px] text-white">
            {notifications.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={markAllRead}
          disabled={isMarkingAll}
          className="text-[12px] font-semibold text-ink-muted underline disabled:opacity-50"
        >
          Tout marquer comme lu
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = TYPE_ICON[n.type] ?? IconChat;
          const inner = (
            <>
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug text-ink">{n.title}</span>
                {n.body ? (
                  <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-ink-muted">
                    {n.body}
                  </span>
                ) : null}
              </span>
              <span className="flex-shrink-0 pt-0.5 text-[11.5px] text-ink-muted">
                {relativeTime(n.created_at)}
              </span>
            </>
          );

          const innerClass = "flex min-w-0 flex-1 items-start gap-2.5";

          return (
            <div
              key={n.id}
              className="flex items-start gap-1.5 rounded-2xl border border-brand/30 bg-surface p-3 shadow-sm"
            >
              {n.task_id ? (
                <Link
                  href={`/tasks/${n.task_id}`}
                  onClick={() => void markNotificationReadAction(n.id)}
                  className={`${innerClass} rounded-lg transition hover:opacity-80`}
                >
                  {inner}
                </Link>
              ) : (
                <div className={innerClass}>{inner}</div>
              )}
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                disabled={isDismissing}
                aria-label="Marquer comme lu"
                title="Marquer comme lu"
                className="flex-shrink-0 rounded-lg p-1 text-ink-muted transition hover:bg-sand hover:text-ink disabled:opacity-50"
              >
                <IconCheck className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
