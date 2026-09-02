import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getComments, getProfile, getTask } from "@/lib/queries";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { OverdueBadge, StatusBadge, VisibilityBadge } from "@/components/Badge";
import { StatusButtons } from "@/components/StatusButtons";
import { ChecklistSection } from "@/components/ChecklistSection";
import { CommentThread } from "@/components/CommentThread";
import { IconArrowLeft, IconCalendar, IconPencil, IconRepeat, IconTag, IconUser, IconUsers } from "@/components/Icons";
import { formatDate, isOverdue, recurrenceLabel } from "@/lib/format";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/categories";
import { canEdit } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = createAdminClient();
  // getTask renvoie null si la tâche n'existe pas OU si profile.id n'y a
  // pas accès (privée à quelqu'un d'autre, ou partagée sans lui) — dans
  // les deux cas on se comporte comme si elle n'existait pas.
  const task = await getTask(supabase, params.id, profile.id);
  if (!task) notFound();

  const [creator, comments] = await Promise.all([
    getProfile(supabase, task.created_by),
    getComments(supabase, task.id),
  ]);

  const overdue = isOverdue(task.due_at, task.status);
  const CategoryIcon = CATEGORY_ICONS[task.category];
  const editable = canEdit(task, profile.id);
  const editors = (task.assignees ?? []).filter((a) => a.role === "editor");
  const viewers = (task.assignees ?? []).filter((a) => a.role === "viewer");

  return (
    <div className="min-h-screen bg-paper">
      <Topbar user={profile} />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-1">
        <div className="mb-4 mt-1.5 flex items-center gap-2.5">
          <Link
            href="/tasks"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface"
          >
            <IconArrowLeft className="h-4 w-4" />
          </Link>
          <h2 className="text-lg font-extrabold">Détail de la tâche</h2>
          {editable ? (
            <Link
              href={`/tasks/${task.id}/edit`}
              className="ml-auto rounded-lg p-1.5 hover:bg-sand"
              title="Modifier"
            >
              <IconPencil className="h-[18px] w-[18px]" />
            </Link>
          ) : null}
        </div>

        <div className="mb-4 rounded-2xl border border-line bg-surface p-[18px] shadow-sm">
          <div className="text-[19px] font-extrabold">{task.title}</div>
          <div className="mb-1.5 mt-1.5 flex flex-wrap gap-2">
            <StatusBadge status={task.status} />
            <VisibilityBadge visibility={task.visibility} />
            {overdue && <OverdueBadge />}
          </div>

          {task.description ? (
            <div className="my-2.5 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</div>
          ) : null}

          <div className="flex items-center gap-1.5 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
            <CategoryIcon className="h-4 w-4" /> Catégorie : <strong className="ml-1 text-ink">{CATEGORY_LABELS[task.category]}</strong>
          </div>
          <div className="flex items-center gap-1.5 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
            <IconCalendar className="h-4 w-4" /> Échéance : <strong className="ml-1 text-ink">{formatDate(task.due_at)}</strong>
          </div>
          <div className="flex items-center gap-1.5 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
            <IconRepeat className="h-4 w-4" /> Récurrence : {recurrenceLabel(task.recurrence)}
          </div>
          <div className="flex items-center gap-1.5 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
            <IconUser className="h-4 w-4" /> Créée par : {creator?.name ?? "?"}
          </div>
          {editors.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
              <IconUsers className="h-4 w-4" /> Assigné(e)s :
              <span className="flex -space-x-1.5">
                {editors.map((a) => (
                  <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
                ))}
              </span>
              <span>{editors.map((a) => a.name).join(", ")}</span>
            </div>
          ) : null}
          {viewers.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
              <IconUser className="h-4 w-4" /> Lecture seule :
              <span className="flex -space-x-1.5">
                {viewers.map((a) => (
                  <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
                ))}
              </span>
              <span>{viewers.map((a) => a.name).join(", ")}</span>
            </div>
          ) : null}
          {task.tags && task.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft py-1.5 text-[13px] text-ink-muted">
              <IconTag className="h-4 w-4" /> Tags :
              {task.tags.map((tag) => (
                <span key={tag.id} className="rounded-full bg-sand px-2 py-0.5 text-[12px] font-medium text-ink">
                  #{tag.name}
                </span>
              ))}
            </div>
          ) : null}

          {editable ? <StatusButtons taskId={task.id} current={task.status} /> : null}
        </div>

        <ChecklistSection taskId={task.id} items={task.checklist ?? []} editable={editable} />

        <CommentThread
          taskId={task.id}
          comments={comments}
          currentUserId={profile.id}
          canModerate={task.created_by === profile.id}
        />
      </main>
    </div>
  );
}
