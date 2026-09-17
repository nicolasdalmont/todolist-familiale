"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleChecklistItemAction } from "@/lib/actions";
import type { ChecklistItem } from "@/lib/types";
import { IconCheck, IconChecklist } from "./Icons";

// Affichée sur l'écran de détail d'une tâche (src/app/tasks/[id]/page.tsx),
// juste au-dessus des commentaires. Depuis le 17/09/2026, créer/renommer/
// supprimer un item se fait depuis le formulaire de tâche (TaskForm.tsx,
// juste sous la description, en création comme en édition) — cette section
// ne fait plus que cocher/décocher, réservé comme avant à `editable`
// (canEdit) : un lecteur voit la checklist sans pouvoir la cocher.
//
// Cocher un item est optimiste (audit UX UX-4) : la case réagit tout de
// suite via un état local `overrides`, l'aller-retour serveur se fait en
// fond sans figer l'écran, et `overrides` est purgé quand la liste
// rafraîchie arrive du serveur. (useOptimistic n'existe pas dans React
// 18.3, la version du projet — d'où cette version manuelle.)
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
  const [, startToggle] = useTransition();

  // Surcharges optimistes de l'état « coché » : id → done visé. Purgées dès
  // que de nouveaux `items` arrivent du serveur (après router.refresh()).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => setOverrides({}), [items]);
  const shown = items.map((i) => (i.id in overrides ? { ...i, done: overrides[i.id] } : i));
  const done = shown.filter((i) => i.done).length;

  function handleToggle(item: ChecklistItem) {
    const next = !item.done;
    setOverrides((o) => ({ ...o, [item.id]: next }));
    startToggle(async () => {
      await toggleChecklistItemAction(taskId, item.id, next);
      router.refresh();
    });
  }

  // Plus rien à gérer depuis cet écran quand elle est vide (pas d'ajout
  // possible ici) — pas la peine d'afficher une carte sans contenu utile.
  if (shown.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-[18px] shadow-sm">
      <div className="flex items-center gap-1.5 text-sm font-bold">
        <IconChecklist className="h-4 w-4 text-ink-muted" />
        Checklist
        <span className="ml-auto text-[12.5px] font-semibold text-ink-muted">
          {done}/{shown.length}
        </span>
      </div>

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
          </li>
        ))}
      </ul>
    </div>
  );
}
