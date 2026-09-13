"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconHelpCircle } from "./Icons";

// Bouton d'aide contextuelle, calé à droite de l'en-tête de chaque écran
// principal (Accueil, Tâches, Agendas, Jardin/Voiture/Santé/Finances, Mon
// compte, Admin) : un court rappel de ce que fait l'écran et comment s'en
// servir, sans quitter la page. Auto-porteur (son propre état ouvert/fermé)
// pour rester une simple ligne à ajouter dans chaque en-tête. Même gabarit
// visuel que ConfirmDialog.tsx, simplifié à un seul bouton "Fermer".
export function HelpButton({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Aide : ${title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-muted hover:text-ink"
      >
        <IconHelpCircle className="h-[18px] w-[18px]" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/25 p-5 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="help-title" className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
              <IconHelpCircle className="h-4 w-4 text-brand" />
              {title}
            </h2>
            <div className="mt-2.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink-muted [&_strong]:font-bold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mt-1">
              {children}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white"
            >
              Compris
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
