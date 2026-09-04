import Link from "next/link";
import type { Task } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categories";
import { Avatar } from "./Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "./Badge";
import { IconCalendar, IconChat, IconRepeat } from "./Icons";

export function TaskCard({ task }: { task: Task }) {
  const overdue = isOverdue(task.due_at, task.status);
  const CategoryIcon = CATEGORY_ICONS[task.category];
  const checklist = task.checklist ?? [];
  const checklistDone = checklist.filter((i) => i.done).length;
  // Vignettes séparées en deux groupes : assigné(e)s (droit de
  // modification) à gauche, lecture seule à droite — demande explicite de
  // l'utilisateur (04/09/2026), pour distinguer d'un coup d'œil qui peut
  // agir sur la tâche de qui peut seulement la consulter. Même principe
  // que l'écran de détail (src/app/tasks/[id]/page.tsx), qui les sépare
  // déjà en deux lignes libellées "Assigné(e)s"/"Lecture seule".
  const editors = (task.assignees ?? []).filter((a) => a.role === "editor");
  const viewers = (task.assignees ?? []).filter((a) => a.role === "viewer");

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 shadow-sm transition hover:border-brand/50"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[15px] font-bold leading-snug ${task.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>
          {task.title}
        </span>
        <StatusBadge status={task.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
        <span className="flex items-center gap-1 rounded-full bg-sand px-2 py-0.5 font-semibold text-ink">
          <CategoryIcon className="h-3.5 w-3.5" /> {CATEGORY_LABELS[task.category]}
        </span>
        {overdue ? (
          <OverdueBadge />
        ) : (
          <span className="flex items-center gap-1">
            <IconCalendar className="h-3.5 w-3.5" /> {formatDate(task.due_at)}
          </span>
        )}
        <VisibilityBadge visibility={task.visibility} />
        {task.recurrence && task.recurrence.type !== "none" && <IconRepeat className="h-3.5 w-3.5" />}
        {task.commentCount ? (
          <span className="flex items-center gap-1" title={`${task.commentCount} commentaire${task.commentCount > 1 ? "s" : ""}`}>
            <IconChat className="h-3.5 w-3.5" /> {task.commentCount}
          </span>
        ) : null}
      </div>
      {task.tags && task.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag.id} className="rounded-full bg-paper px-2 py-0.5 text-[11.5px] font-medium text-ink-muted">
              #{tag.name}
            </span>
          ))}
        </div>
      ) : null}
      {checklist.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(checklistDone / checklist.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[11.5px] font-semibold text-ink-muted">
            {checklistDone}/{checklist.length}
          </span>
        </div>
      ) : null}
      {editors.length > 0 || viewers.length > 0 ? (
        <div className="flex items-center gap-3">
          {editors.length > 0 ? (
            <div className="flex -space-x-2">
              {editors.map((a) => (
                <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
              ))}
            </div>
          ) : null}
          {viewers.length > 0 ? (
            <div className="flex -space-x-2">
              {viewers.map((a) => (
                <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface opacity-60" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
