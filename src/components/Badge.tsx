import type { TaskStatus, Visibility } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/format";
import { IconAlertTriangle, IconLock, IconUsers } from "./Icons";

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: "bg-sand text-ink-muted",
  in_progress: "bg-brand-soft text-brand-dark",
  done: "bg-emerald-50 text-emerald-700",
  archived: "bg-stone-200 text-stone-500",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    // shrink-0 + whitespace-nowrap : dans une ligne flex sans retour à la
    // ligne (ex. titre + pastille de statut sur TaskCard.tsx), un titre
    // long pouvait sinon écraser la pastille jusqu'à faire retourner son
    // propre texte à la ligne (bulle "À faire" cassée en deux) plutôt que
    // de laisser le titre, lui, s'enrouler sur plusieurs lignes — corrigé
    // le 04/09/2026, signalé sur mobile.
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const VISIBILITY_STYLES: Record<Visibility, string> = {
  shared: "bg-emerald-50 text-emerald-700",
  private: "bg-red-50 text-red-600",
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    // shrink-0 + whitespace-nowrap : voir la note dans StatusBadge ci-dessus.
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold ${VISIBILITY_STYLES[visibility]}`}
    >
      {visibility === "shared" ? (
        <>
          <IconUsers className="h-3 w-3" /> Partagée
        </>
      ) : (
        <>
          <IconLock className="h-3 w-3" /> Privée
        </>
      )}
    </span>
  );
}

export function OverdueBadge() {
  return (
    // shrink-0 + whitespace-nowrap : voir la note dans StatusBadge ci-dessus.
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-1 text-[11.5px] font-bold text-red-600">
      <IconAlertTriangle className="h-3 w-3" /> En retard
    </span>
  );
}

// Streak personnel (src/lib/streaks.ts) — jours consécutifs (avec grâce)
// d'activité de l'utilisateur, toutes tâches confondues. À n'afficher que
// pour streak > 0 (voir les appelants) : pas de pastille "🔥 0", pas plus
// utile qu'un compteur vide.
export function StreakBadge({ streak }: { streak: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-orange-50 px-2.5 py-1 text-[11.5px] font-bold text-orange-600">
      🔥 {streak}
    </span>
  );
}
