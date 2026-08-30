import Link from "next/link";
import type { Task } from "@/lib/types";
import { formatDate, isOverdue } from "@/lib/format";
import { Avatar } from "./Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "./Badge";

export function TaskCard({ task }: { task: Task }) {
  const overdue = isOverdue(task.due_at, task.status);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand/50"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[15px] font-bold leading-snug ${task.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>
          {task.title}
        </span>
        <StatusBadge status={task.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
        {overdue ? <OverdueBadge /> : <span>🗓 {formatDate(task.due_at)}</span>}
        <VisibilityBadge visibility={task.visibility} />
        {task.recurrence && task.recurrence.type !== "none" && <span>🔁</span>}
      </div>
      <div className="flex -space-x-2">
        {(task.assignees ?? []).map((a) => (
          <Avatar key={a.id} profile={a} size="sm" className="border-2 border-white" />
        ))}
      </div>
    </Link>
  );
}
