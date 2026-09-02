"use client";

import { useRouter } from "next/navigation";
import type { Comment } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { deleteCommentAction } from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { IconChat, IconX } from "./Icons";

// canModerate = l'utilisateur courant est le créateur de la tâche (voir
// src/lib/actions.ts, deleteCommentAction) : il peut supprimer n'importe
// quel commentaire laissé sur sa tâche, en plus des siens propres. Un
// éditeur/lecteur simplement assigné ne peut supprimer que ses propres
// commentaires.
export function CommentThread({
  taskId,
  comments,
  currentUserId,
  canModerate,
}: {
  taskId: string;
  comments: Comment[];
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useGlobalTransition();

  function handleDelete(commentId: string) {
    startTransition(async () => {
      await deleteCommentAction(taskId, commentId);
      router.refresh();
    });
  }

  return (
    <div>
      <h3 className="mb-2.5 mt-5 flex items-center gap-1.5 text-sm font-bold">
        <IconChat className="h-4 w-4 text-ink-muted" />
        Commentaires
      </h3>

      {comments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-10 text-center text-sm text-ink-muted">
          Aucun commentaire pour l&apos;instant.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {comments.map((c) => {
            const canDelete = c.author_id === currentUserId || canModerate;
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                {c.author ? <Avatar profile={c.author} size="sm" /> : null}
                <div className="flex-1 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[12.5px] font-bold">{c.author?.name ?? "?"}</span>
                      <span className="ml-1.5 text-[11px] text-ink-muted">{relativeTime(c.created_at)}</span>
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleDelete(c.id)}
                        aria-label="Supprimer ce commentaire"
                        className="shrink-0 rounded-lg p-1 text-ink-muted hover:bg-sand hover:text-ink disabled:opacity-50"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[13.5px]">{c.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CommentForm taskId={taskId} />
    </div>
  );
}
