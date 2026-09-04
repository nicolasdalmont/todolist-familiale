"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tag, Task, TaskStatus, Visibility } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { STATUS_LABELS, dateKeyFromIso, isOverdue } from "@/lib/format";
import { canEdit } from "@/lib/access";
import { TaskCard } from "./TaskCard";
import { IconAlertTriangle, IconChevronDown, IconSearch } from "./Icons";

// Mémorisation du filtre (04/09/2026) : ouvrir puis fermer une tâche
// démonte et remonte ce composant (route différente, /tasks/[id]) — sans
// rien de plus, les 8 useState ci-dessous repartiraient de leurs valeurs
// par défaut à chaque retour sur /tasks. sessionStorage restaure l'état
// choisi tant que l'onglet/l'appli reste ouvert(e) (contrairement à
// localStorage, qui survivrait à une fermeture — pas ce qui est demandé),
// sans aller-retour serveur ni contexte React à faire traverser une
// frontière de route.
const FILTER_STORAGE_KEY = "todolist:tasks-filters";

interface PersistedFilters {
  scope: "mine" | "all";
  statuses: TaskStatus[];
  category: string | null;
  dueAtMost: string;
  visibility: Visibility | null;
  overdueOnly: boolean;
  selectedTags: string[];
  query: string;
}

function readPersistedFilters(): Partial<PersistedFilters> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Stockage indisponible (navigation privée, quota...) : pas de filtre
    // restauré, sans conséquence bloquante.
    return null;
  }
}

function writePersistedFilters(filters: PersistedFilters): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Idem : le filtre ne survivra simplement pas à la navigation.
  }
}

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
// 03/09/2026). Masquée sous le point de rupture `sm` : sur mobile, chaque
// groupe de filtres passe à la ligne (voir les conteneurs `flex-col
// sm:flex-row` plus bas) et une barre verticale n'y aurait plus de sens —
// demande explicite de l'utilisateur.
function FilterSeparator() {
  return <span aria-hidden="true" className="hidden h-5 w-px shrink-0 self-center bg-line sm:block" />;
}

// Filtrage additionnel (portée/statut/catégorie/échéance/partagé-privé/
// en retard/tags/mots-clefs), appliqué côté client en mémoire par-dessus
// la liste complète des tâches visibles par l'utilisateur (déjà filtrée
// par canView côté serveur — voir src/lib/access.ts et
// src/app/tasks/page.tsx) : la liste de tâches d'une famille reste petite,
// et ça évite un aller-retour serveur à chaque frappe/clic.
//
// Disposition en 4 lignes à l'intérieur d'un volet dépliable "Filtres"
// (replié par défaut — demande explicite de l'utilisateur, 03/09/2026 —
// la barre de recherche, elle, reste toujours visible au-dessus du
// volet), chaque ligne pouvant regrouper deux filtres séparés par une
// barre verticale sur desktop (`FilterSeparator`, masquée sur mobile où
// les groupes s'empilent l'un sous l'autre) :
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
  // que les tâches dont l'utilisateur est responsable — canEdit(task,
  // currentUserId), voir src/lib/access.ts : créateur, ou assigné(e) avec
  // droit de modification. Même définition que les compteurs de l'accueil
  // (HomeDashboard.tsx) — corrigé le 04/09/2026 pour que cliquer sur un
  // compteur (qui atterrit sur cette portée par défaut) affiche toujours
  // exactement ce qu'il comptait, ni plus ni moins. Exclut les tâches où
  // l'utilisateur est seulement en lecture seule.
  currentUserId: string;
  // Pré-remplit le filtre d'échéance, passé en "?dueAtMost=YYYY-MM-DD" par
  // les tuiles du tableau de bord (voir HomeDashboard.tsx) — ex. "toutes
  // les tâches ouvertes dont l'échéance est aujourd'hui au plus tard".
  initialDueAtMost?: string;
  // Pré-active le filtre "en retard uniquement", passé en "?overdue=1" par
  // la tuile "En retard" du tableau de bord (voir HomeDashboard.tsx).
  initialOverdueOnly?: boolean;
}) {
  // Arrivée depuis une tuile de l'accueil : ces tuiles comptent les tâches
  // dont on est responsable (canEdit, voir HomeDashboard.tsx) — exactement
  // la définition de la portée "mes tâches" par défaut (voir plus bas), donc
  // rien à forcer sur la portée elle-même. On ignore en revanche tout
  // filtre précédemment mémorisé (catégorie, tags, etc.) : le clic sur une
  // tuile est une intention explicite ("montre-moi exactement ça"), pas la
  // reprise d'une session de filtrage antérieure.
  const cameFromTile = Boolean(initialOverdueOnly) || Boolean(initialDueAtMost);

  // États initialisés à leurs valeurs par défaut habituelles (identiques à
  // ce que rend le serveur, pas de sessionStorage ici) : seuls
  // initialDueAtMost/initialOverdueOnly, déjà connus du serveur via l'URL,
  // influencent ce premier rendu. Le filtre mémorisé, lui, n'est restauré
  // qu'après coup (voir l'effet juste en dessous) — le lire dès ces
  // useState créerait un désaccord entre le HTML rendu par le serveur
  // (qui ne connaît pas sessionStorage) et le premier rendu client.
  const [query, setQuery] = useState("");
  // Volet "Filtres" replié par défaut (demande explicite de l'utilisateur,
  // 03/09/2026) : l'écran s'ouvre sur une liste plus courte, sans les 4
  // lignes de filtres — dépliable au besoin via le bouton dédié.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Portée par défaut : mes tâches uniquement — un seul bouton bascule vers
  // "toutes" (tout ce qui m'est visible, y compris en lecture seule) et
  // inversement. "mine" est toujours la valeur initiale, y compris depuis
  // une tuile de l'accueil (cameFromTile) : elle correspond déjà à ce que
  // la tuile a compté, pas besoin de la forcer.
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

  // Restaure, une fois le rendu initial passé (donc uniquement côté
  // client — sessionStorage n'existe pas côté serveur, voir la note
  // ci-dessus), le filtre laissé par la visite précédente de /tasks dans
  // cet onglet. Ignoré si on arrive depuis une tuile de l'accueil : les
  // valeurs de l'URL priment sur tout ce qui aurait pu être mémorisé.
  useEffect(() => {
    if (cameFromTile) return;
    const persisted = readPersistedFilters();
    if (!persisted) return;
    if (persisted.query !== undefined) setQuery(persisted.query);
    if (persisted.scope) setScope(persisted.scope);
    if (persisted.statuses) setStatuses(new Set(persisted.statuses));
    if (persisted.category !== undefined) setCategory(persisted.category);
    if (persisted.dueAtMost !== undefined) setDueAtMost(persisted.dueAtMost);
    if (persisted.visibility !== undefined) setVisibility(persisted.visibility);
    if (persisted.overdueOnly !== undefined) setOverdueOnly(persisted.overdueOnly);
    if (persisted.selectedTags) setSelectedTags(new Set(persisted.selectedTags));
    // Volontairement exécuté une seule fois, au montage — cameFromTile ne
    // change pas pendant la vie du composant (dérivé des props initiales).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Réenregistre l'état courant à chaque changement, pour le retrouver au
  // prochain montage de ce composant tant que l'onglet/l'appli reste
  // ouvert(e) — notamment après avoir ouvert puis refermé une tâche.
  useEffect(() => {
    writePersistedFilters({
      scope,
      statuses: Array.from(statuses),
      category,
      dueAtMost,
      visibility,
      overdueOnly,
      selectedTags: Array.from(selectedTags),
      query,
    });
  }, [scope, statuses, category, dueAtMost, visibility, overdueOnly, selectedTags, query]);

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
      if (scope === "mine" && !canEdit(task, currentUserId)) return false;
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

      {/* Volet dépliable "Filtres" : replié par défaut (voir l'état
          `filtersOpen` plus haut) pour laisser un écran plus court par
          défaut ; la barre de recherche ci-dessus reste toujours visible,
          elle n'en fait pas partie. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((prev) => !prev)}
        aria-expanded={filtersOpen}
        className="flex items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13.5px] font-bold text-ink"
      >
        <span className="flex items-center gap-2">
          Filtres
          {hasActiveFilters ? (
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
          ) : null}
        </span>
        <IconChevronDown
          className={`h-4 w-4 text-ink-muted transition-transform ${filtersOpen ? "rotate-180" : ""}`}
        />
      </button>

      {filtersOpen ? (
        <div className="flex flex-col gap-3">
          {/* Ligne 1 : portée (mes tâches / toutes) │ statut (4 boutons à
              cocher, à faire + en cours par défaut). Sur mobile
              (`flex-col`), la portée et le groupe de statuts passent
              chacun à la ligne, sans séparateur (voir `FilterSeparator`) ;
              à partir de `sm`, ils reviennent sur la même ligne. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setScope((prev) => (prev === "mine" ? "all" : "mine"))}
              className={`self-start rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                scope === "all" ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
              }`}
            >
              Toutes les tâches
            </button>
            <FilterSeparator />
            <div className="flex flex-wrap gap-1.5">
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
          </div>

          {/* Ligne 2 : catégorie (liste déroulante, sélection unique) │
              échéance. Même principe d'empilement sur mobile que la
              ligne 1. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <select
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value || null)}
              className="self-start rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-brand"
            >
              <option value="">Toutes catégories</option>
              {CATEGORY_SELECT_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>

            <FilterSeparator />

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
          </div>

          {/* Ligne 3 : partagé/privé │ en retard uniquement. Même principe
              d'empilement sur mobile que les lignes 1 et 2. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
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
            </div>
            <FilterSeparator />
            <button
              type="button"
              onClick={() => setOverdueOnly((prev) => !prev)}
              className={`flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                overdueOnly ? "border-rose-300 bg-rose-50 text-rose-600" : "border-line bg-surface text-ink-muted"
              }`}
            >
              <IconAlertTriangle className="h-3.5 w-3.5" /> En retard uniquement
            </button>
          </div>

          {/* Ligne 4 : tags (sélection multiple) — un seul groupe, pas de
              séparateur ni de traitement particulier sur mobile. */}
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
