"use client";

import { useMemo, useState } from "react";
import type { Tag, Task, TaskStatus, Visibility } from "@/lib/types";
import { CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { dateKeyFromIso, isOverdue, STATUS_LABELS } from "@/lib/format";
import { TaskCard } from "./TaskCard";
import { IconAlertTriangle, IconSearch } from "./Icons";

// Statuts affichés par défaut (tout sauf "archivée") — reproduit l'ancien
// comportement de l'onglet "Toutes" du temps où le statut était un onglet
// séparé plutôt qu'un filtre ici.
const DEFAULT_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "archived"];

// Filtrage additionnel (statut / partagé-privé / catégorie / tags /
// mots-clefs / échéance), appliqué côté client par-dessus la portée déjà
// résolue côté serveur ("Toutes" vs "Mes tâches", voir
// src/app/tasks/page.tsx). Volontairement en mémoire : la liste de tâches
// d'une famille reste petite, et ça évite un aller-retour serveur à chaque
// frappe.
export function TaskFilterList({
  tasks,
  allTags,
  initialDueAtMost,
  initialOverdueOnly,
}: {
  tasks: Task[];
  allTags: Tag[];
  // Pré-remplit le filtre d'échéance, passé en "?dueAtMost=YYYY-MM-DD" par
  // les tuiles du tableau de bord (voir HomeDashboard.tsx) — ex. "toutes
  // les tâches ouvertes dont l'échéance est aujourd'hui au plus tard".
  initialDueAtMost?: string;
  // Pré-active le filtre "en retard uniquement", passé en "?overdue=1" par
  // la tuile "En retard" du tableau de bord (voir HomeDashboard.tsx).
  initialOverdueOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [dueAtMost, setDueAtMost] = useState(initialDueAtMost ?? "");
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly ?? false);
  const [statuses, setStatuses] = useState<Set<TaskStatus>>(new Set(DEFAULT_STATUSES));
  const [visibility, setVisibility] = useState<Visibility | null>(null);

  const tagNames = useMemo(() => allTags.map((t) => t.name).sort((a, b) => a.localeCompare(b)), [allTags]);

  function toggleTag(name: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleStatus(status: TaskStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!statuses.has(task.status)) return false;
      if (visibility && task.visibility !== visibility) return false;
      if (category && task.category !== category) return false;
      if (selectedTags.size > 0) {
        const taskTagNames = new Set((task.tags ?? []).map((t) => t.name));
        const hasAny = Array.from(selectedTags).some((name) => taskTagNames.has(name));
        if (!hasAny) return false;
      }
      if (dueAtMost) {
        // "Au plus tard à cette date" : exclut les tâches sans échéance
        // (rien à comparer) et celles dont l'échéance dépasse la date
        // choisie. Comparaison de chaînes "YYYY-MM-DD" = comparaison
        // chronologique, sans se soucier de l'heure exacte.
        if (!task.due_at || dateKeyFromIso(task.due_at) > dueAtMost) return false;
      }
      // Même définition du retard que la tuile "En retard" du tableau de
      // bord (voir isOverdue() dans src/lib/format.ts) : ni terminée, ni
      // archivée, échéance dépassée.
      if (overdueOnly && !isOverdue(task.due_at, task.status)) return false;
      if (q) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statuses, visibility, category, selectedTags, dueAtMost, query]);

  const hasActiveFilters =
    statuses.size !== DEFAULT_STATUSES.length ||
    !DEFAULT_STATUSES.every((s) => statuses.has(s)) ||
    visibility !== null ||
    category !== null ||
    selectedTags.size > 0 ||
    dueAtMost.length > 0 ||
    overdueOnly ||
    query.trim().length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une tâche..."
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-[14px] outline-none focus:border-brand"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
            category === null ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
          }`}
        >
          Toutes catégories
        </button>
        {CATEGORY_ORDER.map((c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory((prev) => (prev === c ? null : c))}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                category === c ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
              statuses.has(s) ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { value: null, label: "Toutes" },
            { value: "shared" as Visibility, label: "Partagées" },
            { value: "private" as Visibility, label: "Privées" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => setVisibility(opt.value)}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
              visibility === opt.value ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOverdueOnly((prev) => !prev)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
            overdueOnly ? "border-rose-300 bg-rose-50 text-rose-600" : "border-line bg-surface text-ink-muted"
          }`}
        >
          <IconAlertTriangle className="h-3.5 w-3.5" /> En retard uniquement
        </button>
      </div>

      {tagNames.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tagNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleTag(name)}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                selectedTags.has(name) ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
              }`}
            >
              #{name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="dueAtMost" className="text-[12.5px] font-semibold text-ink-muted">
          Échéance au plus tard le
        </label>
        <input
          id="dueAtMost"
          type="date"
          value={dueAtMost}
          onChange={(e) => setDueAtMost(e.target.value)}
          className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
        />
        {dueAtMost ? (
          <button
            type="button"
            onClick={() => setDueAtMost("")}
            className="text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline"
          >
            Effacer
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-ink-muted">
            {hasActiveFilters ? (
              "Aucune tâche ne correspond à ces critères."
            ) : (
              <>
                Aucune tâche ici pour le moment.
                <br />
                Appuie sur + pour en créer une.
              </>
            )}
          </div>
        ) : (
          filtered.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
