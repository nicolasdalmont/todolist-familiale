import Link from "next/link";
import type { Task } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { Avatar } from "./Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "./Badge";
import { IconCalendar, IconRepeat } from "./Icons";

export function TaskCard({ task }: { task: Task }) {
  const overdue = isOverdue(task.due_at, task.status);

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
      <div className="flex -space-x-2">
        {(task.assignees ?? []).map((a) => (
          <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
        ))}
      </div>
    </Link>
  );
}
