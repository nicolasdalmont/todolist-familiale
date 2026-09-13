import Link from "next/link";
import { Time } from "./Time";
import { IconAlertTriangle, IconChecklist } from "./Icons";

type NextTask = {
  id: string;
  title: string;
  dueAt: string | null;
  overdue: boolean;
};

// « Prochaines tâches à faire » de l'accueil : les 3 tâches ouvertes (à
// faire / en cours, dont je suis responsable) les plus proches dans le
// temps, tri en-retard-d'abord puis échéance croissante — calculées dans
// HomeDashboard.tsx à partir de la même liste `open` que les trois
// compteurs. Rien affiché s'il n'y en a aucune.
export function NextTasksList({ tasks }: { tasks: NextTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="text-[13.5px] font-bold text-ink-muted">Prochaines tâches à faire</h2>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-3 shadow-sm transition hover:border-brand/50"
          >
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-sand text-ink-muted">
              <IconChecklist className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-ink">{t.title}</span>
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
