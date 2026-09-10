import Link from "next/link";
import { Time } from "./Time";
import { IconAlertTriangle, IconArrowLeft, IconUser } from "./Icons";

type SharedTask = {
  id: string;
  title: string;
  dueAt: string | null;
  by: string | null;
  overdue: boolean;
};

// Fil « Partagées avec toi » de l'accueil (audit UX UX-12) : liste
// **pérenne** des tâches ouvertes (à faire / en cours) où l'utilisateur
// est en lecture seule — absentes des compteurs et de la portée par
// défaut de la liste, donc invisibles autrement. Y restent tant qu'elles
// sont ouvertes (les tâches terminées / archivées sont filtrées en amont
// dans HomeDashboard). On n'affiche que **les 3 plus urgentes** (en
// retard d'abord, puis par échéance croissante, sans échéance en
// dernier), avec un lien « Voir tout » vers la liste filtrée. Rien
// affiché s'il n'y en a aucune.
export function SharedWithYouFeed({ tasks }: { tasks: SharedTask[] }) {
  if (tasks.length === 0) return null;

  const rank = (t: SharedTask) => (t.overdue ? 0 : t.dueAt ? 1 : 2);
  const sorted = [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (a.dueAt && b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    return 0;
  });
  const shown = sorted.slice(0, 3);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-muted">
          Partagées avec toi
          <span className="rounded-full bg-ink-muted px-1.5 text-[11px] font-bold leading-[18px] text-white">
            {tasks.length}
          </span>
        </h2>
        {tasks.length > shown.length ? (
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
            {t.overdue ? (
              <span className="flex flex-shrink-0 items-center gap-1 pt-0.5 text-[11.5px] font-bold text-red-600">
                <IconAlertTriangle className="h-3 w-3" /> En retard
              </span>
            ) : t.dueAt ? (
              <Time iso={t.dueAt} className="flex-shrink-0 pt-0.5 text-[11.5px] text-ink-muted" />
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
