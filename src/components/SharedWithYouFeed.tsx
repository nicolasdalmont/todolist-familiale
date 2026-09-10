"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readSeenTaskIds } from "@/lib/seen-tasks";
import { Time } from "./Time";
import { IconArrowLeft, IconUser } from "./Icons";

type SharedTask = { id: string; title: string; dueAt: string | null; by: string | null };

// Fil « Partagées avec toi » de l'accueil (audit UX UX-12) : les tâches
// où l'utilisateur est en **lecture seule** (donc absentes des compteurs
// et de la portée par défaut de la liste) qu'il n'a pas encore ouvertes
// sur cet appareil. On n'en montre que **les 3 plus proches en échéance**
// (celles sans échéance en dernier), avec un lien « Voir tout » qui ouvre
// la liste filtrée sur les tâches en lecture seule — pour ne pas empiler
// une longue liste sur l'accueil. Se vide au fur et à mesure qu'on les
// consulte (MarkTaskSeen sur l'écran de détail). Rien affiché s'il n'y a
// rien.
export function SharedWithYouFeed({ tasks }: { tasks: SharedTask[] }) {
  // Rendu après montage seulement : localStorage n'existe pas côté serveur,
  // le lire au premier rendu créerait un écart d'hydratation.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => setSeen(readSeenTaskIds()), []);

  if (!seen) return null;
  const unseen = tasks.filter((t) => !seen.has(t.id));
  if (unseen.length === 0) return null;

  // Tri par échéance croissante ; les tâches sans échéance en dernier.
  const sorted = [...unseen].sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
  const shown = sorted.slice(0, 3);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-muted">
          Partagées avec toi
          <span className="rounded-full bg-ink-muted px-1.5 text-[11px] font-bold leading-[18px] text-white">
            {unseen.length}
          </span>
        </h2>
        {unseen.length > shown.length ? (
          <Link
            href="/tasks?readOnly=1"
            className="flex items-center gap-1 text-[12px] font-semibold text-ink-muted hover:text-ink"
          >
            Voir tout <IconArrowLeft className="h-3 w-3 rotate-180" />
          </Link>
        ) : null}
      </div>
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
            {t.dueAt ? (
              <Time iso={t.dueAt} className="flex-shrink-0 pt-0.5 text-[11.5px] text-ink-muted" />
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
