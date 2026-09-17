"use client";

import { useEffect, useRef } from "react";

// Variante de ConfirmDialog.tsx dédiée aux tags proches détectés à la
// création (distance de Levenshtein, voir addNewTag dans TaskForm.tsx) :
// ConfirmDialog est binaire (confirmer/annuler), insuffisant dès qu'il y a
// plus d'un tag existant proche de la saisie — ici chaque candidat a son
// propre bouton, en plus de « créer quand même » et « annuler ».
export function SimilarTagsDialog({
  open,
  input,
  matches,
  onUseTag,
  onCreateAnyway,
  onCancel,
}: {
  open: boolean;
  input: string;
  matches: string[];
  onUseTag: (name: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
}) {
  const firstMatchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    firstMatchRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/25 p-5 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="similar-tags-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="similar-tags-title" className="text-[15px] font-extrabold text-ink">
          {matches.length > 1 ? "Tags proches" : "Tag proche"}
        </h2>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          #{input} ressemble à {matches.length > 1 ? "des tags déjà utilisés" : "un tag déjà utilisé"}. Pour éviter
          les doublons, mieux vaut réutiliser un tag existant.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          {matches.map((m, i) => (
            <button
              key={m}
              ref={i === 0 ? firstMatchRef : undefined}
              type="button"
              onClick={() => onUseTag(m)}
              className="rounded-xl border border-line bg-sand px-3 py-2 text-left text-[13.5px] font-semibold text-ink hover:border-brand"
            >
              Utiliser #{m}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCreateAnyway}
            className="rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white"
          >
            Créer #{input} quand même
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-line bg-surface py-2.5 text-[13.5px] font-bold text-ink-muted"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
