"use client";

import { useMemo, useState } from "react";
import type { Tag, Task, TaskStatus, Visibility } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { STATUS_LABELS, dateKeyFromIso, isOverdue } from "@/lib/format";
import { TaskCard } from "./TaskCard";
import { IconAlertTriangle, IconSearch } from "./Icons";

// Ordre de la liste déroulante de catégorie : alphabétique comme
// CATEGORY_ORDER (voir src/lib/categories.ts), sauf "autre" qui est
// volontairement déplacé en bas de liste plutôt qu'à sa place
// alphabétique — demandé explicitement, "autre" étant la catégorie
// fourre-tout, pas une catégorie au même titre que les autres.
const CATEGORY_SELECT_ORDER = [...CATEGORY_ORDER.filter((c) => c !== "autre"), "autre" as const];

// Ordre d'affichage des quatre boutons de statut (ligne 1) — l'ordre
// naturel du cycle de vie d'une tâche, pas l'ordre alphabétique.
const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "archived"];

// Statuts cochés par défaut : tâches actives uniquement (à faire + en
// cours) — voir l'état `statuses` plus bas.
const DEFAULT_STATUSES: TaskStatus[] = ["todo", "in_progress"];

// Petite séparation verticale entre deux groupes de filtres sur une même
// ligne, pour plus de lisibilité (demande explicite de l'utilisateur,
// 03/09/2026).
function FilterSeparator() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 self-center bg-line" />;
}

// Filtrage additionnel (portée/statut/catégorie/échéance/partagé-privé/
// en retard/tags/mots-clefs), appliqué côté client en mémoire par-dessus
// la liste complète des tâches visibles par l'utilisateur (déjà filtrée
// par canView côté serveur — voir src/lib/access.ts et
// src/app/tasks/page.tsx) : la liste de tâches d'une famille reste petite,
// et ça évite un aller-retour serveur à chaque frappe/clic.
//
// Disposition en 4 lignes, chaque ligne pouvant regrouper deux filtres
// séparés par une barre verticale (`FilterSeparator`, demande explicite
// de l'utilisateur, 03/09/2026) :
//   1. Portée (mes tâches / toutes) │ statut (4 boutons à cocher, à
//      faire + en cours cochés par défaut)
//   2. Catégorie (liste déroulante, sélection unique) │ échéance
//   3. Partagé/Privé │ en retard uniquement
//   4. Tags (sélection multiple)
export function TaskFilterList({
  tasks,
  allTags,
  currentUserId,
  initialDueAtMost,
  initialOverdueOnly,
}: {
  tasks: Task[];
  allTags: Tag[];
  // Sert le filtre de portée (ligne 1) : "mes tâches" par défaut ne garde
  // que task.created_by === currentUserId.
  currentUserId: string;
  // Pré-remplit le filtre d'échéance, passé en "?dueAtMost=YYYY-MM-DD" par
  // les tuiles du tableau de bord (voir HomeDashboard.tsx) — ex. "toutes
  // les tâches ouvertes dont l'échéance est aujourd'hui au plus tard".
  initialDueAtMost?: string;
  // Pré-active le filtre "en retard uniquement", passé en "?overdue=1" par
  // la tuile "En retard" du tableau de bord (voir HomeDashboard.tsx).
  initialOverdueOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  // Portée par défaut : mes tâches uniquement — un seul bouton bascule vers
  // "toutes" (tout ce qui m'est visible, y compris partagé avec moi) et
  // inversement.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // Statut par défaut : à faire + en cours cochés (sélection multiple, un
  // bouton par statut) — reproduit le comportement d'avant la première
  // rationalisation (03/09/2026), jugé plus pratique à l'usage qu'un seul
  // bouton à bascule "tous les statuts".
  const [statuses, setStatuses] = useState<Set<TaskStatus>>(new Set(DEFAULT_STATUSES));
  const [category, setCategory] = useState<string | null>(null);
  const [dueAtMost, setDueAtMost] = useState(initialDueAtMost ?? "");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly ?? false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

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
      if (scope === "mine" && task.created_by !== currentUserId) return false;
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
  }, [tasks, scope, currentUserId, statuses, visibility, category, selectedTags, dueAtMost, overdueOnly, query]);

  // Compare l'ensemble courant des statuts cochés à la valeur par défaut
  // (à faire + en cours), quel que soit l'ordre — un simple `!==` ne
  // fonctionnerait pas sur deux `Set` distincts.
  const isDefaultStatuses =
    statuses.size === DEFAULT_STATUSES.length && DEFAULT_STATUSES.every((s) => statuses.has(s));

  const hasActiveFilters =
    scope !== "mine" ||
    !isDefaultStatuses ||
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

      {/* Ligne 1 : portée (mes tâches / toutes) │ statut (4 boutons à
          cocher, à faire + en cours par défaut). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setScope((prev) => (prev === "mine" ? "all" : "mine"))}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
            scope === "all" ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
          }`}
        >
          Toutes les tâches
        </button>
        <FilterSeparator />
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
              statuses.has(status) ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* Ligne 2 : catégorie (liste déroulante, sélection unique) │
          échéance. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value || null)}
          className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand"
        >
          <option value="">Toutes catégories</option>
          {CATEGORY_SELECT_ORDER.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>

        <FilterSeparator />

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

      {/* Ligne 3 : partagé/privé │ en retard uniquement. */}
      <div className="flex flex-wrap items-center gap-1.5">
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
        <FilterSeparator />
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

      {/* Ligne 4 : tags (sélection multiple). */}
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
