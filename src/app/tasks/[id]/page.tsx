import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getComments, getProfile, getTask } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "@/components/Badge";
import { StatusButtons } from "@/components/StatusButtons";
import { CommentThread } from "@/components/CommentThread";
import { formatDate, isOverdue, recurrenceLabel } from "@/lib/format";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  const task = await getTask(supabase, params.id);
  if (!task) notFound();

  const [creator, comments] = await Promise.all([
    getProfile(supabase, task.created_by),
    getComments(supabase, task.id),
  ]);

  const overdue = isOverdue(task.due_at, task.status);

  return (
    <div className="min-h-screen bg-[#f6f5fb]">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[17px]"
          >
            ←
          </Link>
          <h2 className="text-lg font-extrabold">Détail de la tâche</h2>
          <Link href={`/tasks/${task.id}/edit`} className="ml-auto rounded-lg p-1.5 text-lg hover:bg-slate-100" title="Modifier">
            ✏️
          </Link>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-[18px] shadow-sm">
          <div className="text-[19px] font-extrabold">{task.title}</div>
          <div className="mb-1.5 mt-1.5 flex flex-wrap gap-2">
            <StatusBadge status={task.status} />
            <VisibilityBadge visibility={task.visibility} />
            {overdue && <OverdueBadge />}
          </div>

          {task.description ? (
            <div className="my-2.5 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</div>
          ) : null}

          <div className="border-t border-slate-100 py-1.5 text-[13px] text-ink-muted">
            🗓 Échéance : <strong className="ml-1 text-ink">{formatDate(task.due_at)}</strong>
          </div>
          <div className="border-t border-slate-100 py-1.5 text-[13px] text-ink-muted">
            🔁 Récurrence : {recurrenceLabel(task.recurrence)}
          </div>
          <div className="border-t border-slate-100 py-1.5 text-[13px] text-ink-muted">
            🙋 Créée par : {creator?.name ?? "?"}
          </div>
          <div className="flex items-center gap-2 border-t border-slate-100 py-1.5 text-[13px] text-ink-muted">
            👤 Assigné(e)s :
            <span className="flex -space-x-1.5">
              {(task.assignees ?? []).map((a) => (
                <Avatar key={a.id} profile={a} size="sm" className="border-2 border-white" />
              ))}
            </span>
            <span>{(task.assignees ?? []).map((a) => a.name).join(", ")}</span>
          </div>

          <StatusButtons taskId={task.id} current={task.status} />
        </div>

        <CommentThread taskId={task.id} comments={comments} />
      </main>
    </div>
  );
}
