"use client";

import { useCallback, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  toggleChecklistItemAction,
} from "@/lib/actions";
import { useGlobalTransition } from "@/components/PendingOverlay";
import { useUndoableDelete } from "@/components/useUndoableDelete";
import type { ChecklistItem } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { IconCheck, IconChecklist, IconX } from "./Icons";

// Affichée sur l'écran de détail d'une tâche (src/app/tasks/[id]/page.tsx),
// juste au-dessus des commentaires. Contrairement à ceux-ci, ajouter/cocher/
// supprimer un item exige `editable` (canEdit) — un lecteur voit la
// checklist mais ne peut pas la modifier (voir src/lib/actions.ts).
//
// Cocher un item est optimiste (audit UX UX-4) : la case réagit tout de
// suite via un état local `overrides`, l'aller-retour serveur se fait en
// fond sans figer l'écran, et `overrides` est purgé quand la liste
// rafraîchie arrive du serveur. (useOptimistic n'existe pas dans React
// 18.3, la version du projet — d'où cette version manuelle.)
// Supprimer un item passe par le mécanisme « Annuler » (INC-10).
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
  const [isAdding, startAdd] = useGlobalTransition();
  const [, startToggle] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  // Surcharges optimistes de l'état « coché » : id → done visé. Purgées dès
  // que de nouveaux `items` arrivent du serveur (après router.refresh()).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => setOverrides({}), [items]);
  const optimisticItems = items.map((i) =>
    i.id in overrides ? { ...i, done: overrides[i.id] } : i
  );

  const performDelete = useCallback(
    (id: string) => deleteChecklistItemAction(taskId, id),
    [taskId]
  );
  const { pending: pendingDelete, remove } = useUndoableDelete({
    perform: performDelete,
    message: "Élément supprimé",
  });

  const shown = optimisticItems.filter((i) => !pendingDelete.has(i.id));
  const done = shown.filter((i) => i.done).length;

  function handleToggle(item: ChecklistItem) {
    const next = !item.done;
    setOverrides((o) => ({ ...o, [item.id]: next }));
    startToggle(async () => {
      await toggleChecklistItemAction(taskId, item.id, next);
      router.refresh();
    });
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;

    // Referme le clavier et laisse Safari iOS dézoomer avant le
    // router.refresh() ci-dessous : le champ resterait sinon focus (donc
    // zoomé) pendant tout le rafraîchissement, Safari ne redézoomant pas
    // toujours de façon fiable dans ce cas.
    (document.activeElement as HTMLElement | null)?.blur();

    const formData = new FormData();
    formData.set("taskId", taskId);
    formData.set("label", label);

    startAdd(async () => {
      await addChecklistItemAction(formData);
      setNewLabel("");
      router.refresh();
    });
  }

  // Rien à afficher pour un lecteur si la checklist est vide — pas la peine
  // d'annoncer une section qu'il ne peut de toute façon pas remplir.
  if (shown.length === 0 && !editable) return null;

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-[18px] shadow-sm">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <IconChecklist className="h-4 w-4 text-ink-muted" />
        Checklist
        {shown.length > 0 ? (
          <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">
            {done}/{shown.length}
          </span>
        ) : null}
      </div>

      {shown.length > 0 ? (
        <>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sand">
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${(done / shown.length) * 100}%` }}
            />
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => handleToggle(item)}
                  aria-pressed={item.done}
                  aria-label={item.done ? `« ${item.label} » : marquer à faire` : `« ${item.label} » : marquer fait`}
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
                    onClick={() => remove(item.id)}
                    aria-label={`Supprimer « ${item.label} »`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState className="mt-2.5">Aucun item pour l&apos;instant.</EmptyState>
      )}

      {editable ? (
        <form onSubmit={handleAdd} className="mt-3 flex items-start gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Ajouter un item..."
            className="flex-1 rounded-xl border border-line px-3 py-2.5 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={isAdding}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
          >
            Ajouter
          </button>
        </form>
      ) : null}
    </div>
  );
}
