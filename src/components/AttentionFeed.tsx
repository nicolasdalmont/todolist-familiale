"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationItem, NotificationType } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { markNotificationsReadAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { IconCalendar, IconChat, IconCheck, IconUsers } from "./Icons";

// Fil « À ton attention » affiché sous les compteurs de l'écran d'accueil
// (src/components/HomeDashboard.tsx) : le miroir in-app des notifications
// (tâche partagée avec moi, commentaire sur une tâche que je vois,
// changement de statut, échéance proche). Alimenté par
// getMyNotifications() (src/lib/queries.ts) ; écrit par notifyUser() /
// notifyTaskParticipants() (src/lib/notifications.ts). Toujours visible
// dès qu'il y a au moins une notification, que les push soient activés ou
// non.

const TYPE_ICON: Record<NotificationType, typeof IconChat> = {
  task_shared: IconUsers,
  comment_added: IconChat,
  status_changed: IconCheck,
  due_soon: IconCalendar,
};

export function AttentionFeed({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useGlobalTransition();

  if (notifications.length === 0) return null;

  const unread = notifications.filter((n) => !n.read_at).length;

  function markAllRead() {
    startTransition(async () => {
      await markNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-muted">
          À ton attention
          {unread > 0 ? (
            <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold leading-[18px] text-white">
              {unread}
            </span>
          ) : null}
        </h2>
        {unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            disabled={isPending}
            className="text-[12px] font-semibold text-ink-muted underline disabled:opacity-50"
          >
            Tout marquer comme lu
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {notifications.map((n) => {
          const Icon = TYPE_ICON[n.type] ?? IconChat;
          const content = (
            <>
              <span
                className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${
                  n.read_at ? "bg-sand text-ink-muted" : "bg-brand-soft text-brand-dark"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">
                <span
                  className={`block text-[13px] leading-snug ${
                    n.read_at ? "text-ink-muted" : "font-medium text-ink"
                  }`}
                >
                  {n.title}
                </span>
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

          const cls = `flex items-start gap-2.5 rounded-2xl border p-3 shadow-sm transition ${
            n.read_at ? "border-line bg-surface" : "border-brand/30 bg-surface"
          } ${n.task_id ? "hover:border-brand/50" : ""}`;

          return n.task_id ? (
            <Link key={n.id} href={`/tasks/${n.task_id}`} className={cls}>
              {content}
            </Link>
          ) : (
            <div key={n.id} className={cls}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
