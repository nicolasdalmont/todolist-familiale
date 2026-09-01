import type { Comment } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { Avatar } from "./Avatar";
import { CommentForm } from "./CommentForm";
import { IconChat } from "./Icons";

export function CommentThread({ taskId, comments }: { taskId: string; comments: Comment[] }) {
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
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2.5">
              {c.author ? <Avatar profile={c.author} size="sm" /> : null}
              <div className="flex-1 rounded-xl border border-line bg-surface px-3 py-2">
                <span className="text-[12.5px] font-bold">{c.author?.name ?? "?"}</span>
                <span className="ml-1.5 text-[11px] text-ink-muted">{relativeTime(c.created_at)}</span>
                <div className="mt-0.5 text-[13.5px]">{c.body}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CommentForm taskId={taskId} />
    </div>
  );
}
