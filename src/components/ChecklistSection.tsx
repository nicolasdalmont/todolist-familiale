"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from "@/lib/actions";
import type { ChecklistItem } from "@/lib/types";
import { IconCheck, IconChecklist, IconX } from "./Icons";

// Affichée sur l'écran de détail d'une tâche (src/app/tasks/[id]/page.tsx),
// juste au-dessus des commentaires. Contrairement à ceux-ci, ajouter/cocher/
// supprimer un item exige `editable` (canEdit) — un lecteur voit la
// checklist mais ne peut pas la modifier (voir src/lib/actions.ts).
export function ChecklistSection({
  taskId,
  items,
  editable,
}: {
  taskId: string;
  items: ChecklistItem[];
  editable: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  // Rien à afficher pour un lecteur si la checklist est vide — pas la peine
  // d'annoncer une section qu'il ne peut de toute façon pas remplir.
  if (items.length === 0 && !editable) return null;

  const done = items.filter((i) => i.done).length;

  function handleToggle(item: ChecklistItem) {
    startTransition(async () => {
      await toggleChecklistItemAction(taskId, item.id, !item.done);
      router.refresh();
    });
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      await deleteChecklistItemAction(taskId, itemId);
      router.refresh();
    });
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("label", label);

    startTransition(async () => {
      await addChecklistItemAction(formData);
      setNewLabel("");
      router.refresh();
    });
  }

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-[18px] shadow-sm">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <IconChecklist className="h-4 w-4 text-ink-muted" />
        Checklist
        {items.length > 0 ? (
          <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">
            {done}/{items.length}
          </span>
        ) : null}
      </div>

      {items.length > 0 ? (
        <>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!editable || isPending}
                  onClick={() => handleToggle(item)}
                  aria-label={item.done ? "Marquer comme à faire" : "Marquer comme fait"}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 disabled:opacity-70 ${
                    item.done ? "border-brand bg-brand text-white" : "border-line text-transparent"
                  }`}
                >
                  <IconCheck className="h-3 w-3" />
                </button>
                <span className={`flex-1 text-[13.5px] ${item.done ? "text-ink-muted line-through" : "text-ink"}`}>
                  {item.label}
                </span>
                {editable ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDelete(item.id)}
                    aria-label="Supprimer cet item"
                    className="rounded-lg p-1 text-ink-muted hover:bg-sand hover:text-ink disabled:opacity-50"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-2.5 text-[13px] text-ink-muted">Aucun item pour l&apos;instant.</div>
      )}

      {editable ? (
        <form onSubmit={handleAdd} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Ajouter un item..."
            className="flex-1 rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-brand px-4 text-[13.5px] font-bold text-white disabled:opacity-50"
          >
            Ajouter
          </button>
        </form>
      ) : null}
    </div>
  );
}
