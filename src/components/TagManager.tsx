"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tag } from "@/lib/types";
import { deleteTagAction, mergeTagsAction } from "@/lib/tag-actions";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Troisième bloc de l'onglet « Catégories » de l'écran /admin (voir
// AdminScreen.tsx), après les catégories de tâches et de jardin : gestion
// des tags (table tags / task_tags, migration 001). Les tags se créent
// librement depuis TaskForm.tsx — ce panneau ne sert qu'au ménage :
// supprimer un tag, ou en fusionner deux pour éviter que la liste ne
// s'éparpille en variantes proches (src/lib/tag-actions.ts).
export function TagManager({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [merging, setMerging] = useState<Tag | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Tag | null>(null);

  function openMerge(tag: Tag) {
    setMergeError(null);
    setMergeTarget("");
    setMerging(tag);
  }

  function handleMerge() {
    if (!merging || !mergeTarget) return;
    setMergeError(null);
    startTransition(async () => {
      const res = await mergeTagsAction(merging.id, mergeTarget);
      if (res.error) {
        setMergeError(res.error);
        return;
      }
      const targetName = tags.find((t) => t.id === mergeTarget)?.name ?? "";
      setMerging(null);
      toast.show({ message: `#${merging.name} fusionné dans #${targetName}`, tone: "success" });
      router.refresh();
    });
  }

  function handleDelete() {
    const target = deleting;
    setDeleting(null);
    if (!target) return;
    startTransition(async () => {
      const res = await deleteTagAction(target.id);
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      toast.show({ message: `#${target.name} supprimé`, tone: "success" });
      router.refresh();
    });
  }

  if (tags.length === 0) {
    return <p className="text-[13px] text-ink-muted">Aucun tag pour l&apos;instant.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-muted">
        {tags.length} tag{tags.length > 1 ? "s" : ""}
      </p>

      <div className="flex flex-col gap-2">
        {tags.map((tag) => (
          <div key={tag.id} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[14px] font-bold">#{tag.name}</span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => (merging?.id === tag.id ? setMerging(null) : openMerge(tag))}
                  className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Fusionner
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(tag)}
                  className="ml-2 text-[12px] font-semibold text-red-600 underline-offset-2 hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </div>

            {merging?.id === tag.id ? (
              <div className="mt-3 flex flex-col gap-2.5 border-t border-line-soft pt-3">
                <div>
                  <label className="mb-1 block text-[12px] font-bold" htmlFor={`tag-merge-target-${tag.id}`}>
                    Remplacer #{tag.name} par
                  </label>
                  <select
                    id={`tag-merge-target-${tag.id}`}
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand"
                  >
                    <option value="">Choisir un tag…</option>
                    {tags
                      .filter((t) => t.id !== tag.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          #{t.name}
                        </option>
                      ))}
                  </select>
                </div>
                <p className="text-[12px] text-ink-muted">
                  Les tâches taguées #{tag.name} seront retaguées avec le tag choisi, puis #{tag.name} sera
                  supprimé.
                </p>
                {mergeError ? <p className="text-[12px] font-semibold text-red-600">{mergeError}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isPending || !mergeTarget}
                    onClick={handleMerge}
                    className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    Fusionner
                  </button>
                  <button
                    type="button"
                    onClick={() => setMerging(null)}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-bold text-ink-muted"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Supprimer le tag #${deleting.name} ?` : ""}
        body="Il sera retiré de toutes les tâches qui le portent."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
