"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSeenTaskIds } from "@/lib/seen-tasks";
import { IconUser } from "./Icons";

type SharedTask = { id: string; title: string; by: string | null };

// Fil « Partagées avec toi » de l'accueil (audit UX UX-12) : les tâches
// où l'utilisateur est en **lecture seule** (donc absentes des compteurs
// et de la portée par défaut de la liste) qu'il n'a pas encore ouvertes
// sur cet appareil. Se vide au fur et à mesure qu'il les consulte
// (MarkTaskSeen sur l'écran de détail). Rien affiché s'il n'y a rien —
// contrairement à « Activité du jour », cette section n'existe que quand
// elle a du contenu.
export function SharedWithYouFeed({ tasks }: { tasks: SharedTask[] }) {
  // Rendu après montage seulement : localStorage n'existe pas côté serveur,
  // le lire au premier rendu créerait un écart d'hydratation.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => setSeen(readSeenTaskIds()), []);

  if (!seen) return null;
  const unseen = tasks.filter((t) => !seen.has(t.id));
  if (unseen.length === 0) return null;

  const shown = unseen.slice(0, 5);
  const rest = unseen.length - shown.length;

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-muted">
        Partagées avec toi
        <span className="rounded-full bg-ink-muted px-1.5 text-[11px] font-bold leading-[18px] text-white">
          {unseen.length}
        </span>
      </h2>
      <div className="flex flex-col gap-2">
        {shown.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-sm transition hover:border-brand/50"
          >
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-sand text-ink-muted">
              <IconUser className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium leading-snug text-ink">{t.title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">
                {t.by ? `Partagée par ${t.by} · lecture seule` : "Lecture seule"}
              </span>
            </span>
          </Link>
        ))}
        {rest > 0 ? (
          <p className="px-1 text-[12px] text-ink-muted">
            et {rest} autre{rest > 1 ? "s" : ""}…
          </p>
        ) : null}
      </div>
    </div>
  );
}
