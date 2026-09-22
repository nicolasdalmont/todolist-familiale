"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Idea, IdeaStatus } from "@/lib/types";
import { createIdeaAction, deleteIdeaAction, setIdeaStatusAction } from "@/lib/ideas-actions";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Time } from "@/components/Time";
import { IconPlus, IconTrash } from "@/components/Icons";

// Onglet Idées (migration 010) — boîte à idées familiale, à l'image de la
// fonctionnalité équivalente sur mabedetheque (autre projet de
// l'utilisateur) : formulaire de saisie libre, liste triée par date de
// création décroissante, filtrage par statut, changement de statut via
// select, suppression via ConfirmDialog. Même moule que TagManager.tsx /
// RewardManager.tsx pour la structure Server Action + toast + router.refresh().

const STATUS_ORDER: IdeaStatus[] = ["created", "processed", "done"];

const STATUS_LABEL: Record<IdeaStatus, string> = {
  created: "Proposée",
  processed: "En cours",
  done: "Réalisée",
};

const STATUS_SELECT_STYLE: Record<IdeaStatus, string> = {
  created: "border-zinc-400/50 text-ink-muted",
  processed: "border-amber-500/50 text-amber-700",
  done: "border-emerald-600/40 text-emerald-700",
};

function chipClass(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
    active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted hover:border-brand/50"
  }`;
}

export function IdeesScreen({ ideas, currentUserId }: { ideas: Idea[]; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [content, setContent] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");
  const [deleting, setDeleting] = useState<Idea | null>(null);

  const filtered = useMemo(
    () => (statusFilter === "all" ? ideas : ideas.filter((i) => i.status === statusFilter)),
    [ideas, statusFilter]
  );

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setCreateError(null);
    const fd = new FormData();
    fd.set("content", content.trim());
    startTransition(async () => {
      const res = await createIdeaAction(fd);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setContent("");
      toast.show({ message: "Idée ajoutée", tone: "success" });
      router.refresh();
    });
  }

  function handleStatusChange(idea: Idea, status: IdeaStatus) {
    startTransition(async () => {
      const res = await setIdeaStatusAction(idea.id, status);
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    startTransition(async () => {
      const res = await deleteIdeaAction(target.id);
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      toast.show({ message: "Idée supprimée", tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCreate} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <label htmlFor="idea-content" className="text-[12.5px] font-bold">
          Nouvelle idée
        </label>
        <textarea
          id="idea-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Une idée d'amélioration, de sortie, de projet familial…"
          className="w-full resize-y rounded-xl border border-line bg-transparent px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        />
        {createError ? <p className="text-[12.5px] font-semibold text-red-600">{createError}</p> : null}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!content.trim() || isPending}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          >
            <IconPlus className="h-3.5 w-3.5" /> Ajouter l&apos;idée
          </button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setStatusFilter("all")} className={chipClass(statusFilter === "all")}>
          Toutes
        </button>
        {STATUS_ORDER.map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={chipClass(statusFilter === s)}>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState>
          {ideas.length === 0 ? "Aucune idée pour l'instant — ajoute la première !" : "Aucune idée ne correspond à ce filtre."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((idea) => (
            <div key={idea.id} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
              <p className="whitespace-pre-wrap text-[14px] text-ink">{idea.content}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-ink-muted">
                  {idea.createdByName}
                  {idea.createdBy === currentUserId ? " (toi)" : ""} · <Time iso={idea.createdAt} relative />
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={idea.status}
                    disabled={isPending}
                    onChange={(e) => handleStatusChange(idea, e.target.value as IdeaStatus)}
                    className={`rounded-lg border bg-transparent px-2 py-1 text-[12px] font-semibold outline-none ${STATUS_SELECT_STYLE[idea.status]}`}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDeleting(idea)}
                    aria-label="Supprimer cette idée"
                    className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Supprimer cette idée ?"
        body="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
