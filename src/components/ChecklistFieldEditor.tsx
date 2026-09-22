"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { IconChecklist, IconX } from "@/components/Icons";

export type ChecklistDraftItem = { id?: string; label: string };

// Édition (ajout/renommage/suppression, pas de coche) d'une checklist dans
// un formulaire de création/modification — extrait de TaskForm.tsx le
// 22/09/2026 pour être réutilisé aussi dans les formulaires d'activité
// d'agenda (Jardin/Voiture/Santé/Finances). Contrôlé par le parent
// (`value`/`onChange`) plutôt que de porter son propre état : chaque
// formulaire appelant reste libre de sa propre stratégie de soumission
// (champ caché JSON pour TaskForm, FormData construite à la main pour les
// écrans d'agenda — voir src/lib/checklist.ts côté serveur pour le format
// partagé {id?, label}[]).
export function ChecklistFieldEditor({
  value,
  onChange,
}: {
  value: ChecklistDraftItem[];
  onChange: (items: ChecklistDraftItem[]) => void;
}) {
  const [newLabel, setNewLabel] = useState("");

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    onChange([...value, { label }]);
    setNewLabel("");
  }

  function rename(index: number, label: string) {
    onChange(value.map((item, i) => (i === index ? { ...item, label } : item)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold">
        <IconChecklist className="h-3.5 w-3.5 text-ink-muted" /> Checklist
      </label>
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {value.map((item, index) => (
            <li key={item.id ?? `new-${index}`} className="flex items-center gap-2">
              <input
                type="text"
                value={item.label}
                onChange={(e) => rename(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="flex-1 rounded-xl border border-line px-3 py-2 text-[13px] outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Supprimer « ${item.label} »`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-sand hover:text-ink"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Aucun item pour l&apos;instant.</EmptyState>
      )}
      <div className="mt-2 flex items-start gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ajouter un item..."
          className="flex-1 rounded-xl border border-line px-3 py-2.5 text-[13px] outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-xl border border-line bg-surface px-4 py-2.5 text-[13px] font-bold text-ink-muted"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
