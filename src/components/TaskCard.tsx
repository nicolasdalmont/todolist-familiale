import Link from "next/link";
import type { Task } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categories";
import { Avatar } from "./Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "./Badge";
import { IconCalendar, IconRepeat } from "./Icons";

export function TaskCard({ task }: { task: Task }) {
  const overdue = isOverdue(task.due_at, task.status);
  const CategoryIcon = CATEGORY_ICONS[task.category];
  const checklist = task.checklist ?? [];
  const checklistDone = checklist.filter((i) => i.done).length;

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
      <div className="flex -space-x-2">
        {(task.assignees ?? []).map((a) => (
          <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
        ))}
      </div>
    </Link>
  );
}
