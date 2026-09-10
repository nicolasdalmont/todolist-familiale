"use client";

import { useCallback } from "react";
import type { Comment } from "@/lib/types";
import { deleteCommentAction } from "@/lib/actions";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { Time } from "./Time";
import { EmptyState } from "./EmptyState";
import { useUndoableDelete } from "./useUndoableDelete";
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
  const perform = useCallback((id: string) => deleteCommentAction(taskId, id), [taskId]);
  const { pending, remove } = useUndoableDelete({ perform, message: "Commentaire supprimé" });

  const visible = comments.filter((c) => !pending.has(c.id));

  return (
    <div>
      <h3 className="mb-2.5 mt-5 flex items-center gap-1.5 text-sm font-bold">
        <IconChat className="h-4 w-4 text-ink-muted" />
        Commentaires
      </h3>

      <CommentForm taskId={taskId} />

      {visible.length === 0 ? (
        <EmptyState>Aucun commentaire pour l&apos;instant.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((c) => {
            const canDelete = c.author_id === currentUserId || canModerate;
            return (
              <div key={c.id} className="flex items-start gap-2.5">
                {c.author ? <Avatar profile={c.author} size="sm" /> : null}
                <div className="flex-1 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[12.5px] font-bold">{c.author?.name ?? "?"}</span>
                      <Time iso={c.created_at} relative className="ml-1.5 text-[11px] text-ink-muted" />
                    </div>
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        aria-label="Supprimer ce commentaire"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
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
    </div>
  );
}
