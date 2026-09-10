"use client";

import { useEffect, useRef } from "react";

// Boîte de confirmation à la marque (audit UX INC-10) — remplace
// window.confirm(), non stylé et dépareillé dans une PWA installée.
// Contrôlée par le parent : rendue seulement quand `open`.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
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
      aria-labelledby="confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-[15px] font-extrabold text-ink">
          {title}
        </h2>
        {body ? <p className="mt-1.5 text-[13.5px] text-ink-muted">{body}</p> : null}
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line bg-surface py-2.5 text-[13.5px] font-bold text-ink-muted"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl py-2.5 text-[13.5px] font-bold text-white ${
              destructive ? "bg-red-600" : "bg-brand"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
