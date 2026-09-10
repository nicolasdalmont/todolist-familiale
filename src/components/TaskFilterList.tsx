"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category, Tag, Task, TaskStatus, Visibility } from "@/lib/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { STATUS_LABELS, dateKeyFromIso, isOverdue } from "@/lib/format";
import { canEdit } from "@/lib/access";
import { TaskCard } from "./TaskCard";
import { EmptyState } from "./EmptyState";
import { IconAlertTriangle, IconCheck, IconChevronDown, IconSearch, IconUser } from "./Icons";

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
  dueFrom: string;
  dueAtMost: string;
  visibility: Visibility | null;
  overdueOnly: boolean;
  readOnlyOnly: boolean;
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
  initialDueFrom,
  initialDueAtMost,
  initialOverdueOnly,
  initialReadOnly,
}: {
  tasks: Task[];
  allTags: Tag[];
  // Sert le filtre de portée (ligne 1). Bouton "Uniquement mes tâches",
  // **coché par défaut** : ne garde que les tâches dont l'utilisateur est
  // responsable — canEdit(task, currentUserId), voir src/lib/access.ts :
  // créateur, ou assigné(e) avec droit de modification. Même définition que
  // les compteurs de l'accueil (HomeDashboard.tsx) — cliquer sur un
  // compteur atterrit sur cette portée par défaut et affiche donc
  // exactement ce qu'il comptait. Décocher le bouton ajoute les tâches où
  // l'utilisateur est seulement en lecture seule.
  currentUserId: string;
  // Bornent le filtre d'échéance, passés en "?dueFrom=YYYY-MM-DD" et/ou
  // "?dueAtMost=YYYY-MM-DD" par les tuiles du tableau de bord (voir
  // HomeDashboard.tsx). Les deux bornes ensemble = un intervalle exact
  // ("dues aujourd'hui", "dues d'ici dimanche") pour que la liste montre
  // exactement ce que la tuile a compté (audit UX INC-1).
  initialDueFrom?: string;
  initialDueAtMost?: string;
  // Pré-active le filtre "en retard uniquement", passé en "?overdue=1" par
  // la tuile "En retard" du tableau de bord (voir HomeDashboard.tsx).
  initialOverdueOnly?: boolean;
  // Pré-active le filtre "lecture seule uniquement", passé en "?readOnly=1"
  // par le lien « Voir tout » du fil « Partagées avec toi » de l'accueil
  // (SharedWithYouFeed.tsx, audit UX UX-12) : ne garde que les tâches où
  // l'utilisateur n'a PAS le droit de modifier. Quand il est actif, il
  // prime sur la portée "mes tâches / toutes".
  initialReadOnly?: boolean;
}) {
  // Arrivée depuis une tuile de l'accueil : ces tuiles comptent les tâches
  // dont on est responsable (canEdit, voir HomeDashboard.tsx) — exactement
  // la définition de la portée "mes tâches" par défaut (voir plus bas), donc
  // rien à forcer sur la portée elle-même. On ignore en revanche tout
  // filtre précédemment mémorisé (catégorie, tags, etc.) : le clic sur une
  // tuile est une intention explicite ("montre-moi exactement ça"), pas la
  // reprise d'une session de filtrage antérieure.
  const cameFromTile =
    Boolean(initialOverdueOnly) ||
    Boolean(initialDueAtMost) ||
    Boolean(initialDueFrom) ||
    Boolean(initialReadOnly);

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
  // Portée : "mine" par défaut (bouton "Uniquement mes tâches" coché) ;
  // décocher passe à "all" (ajoute les tâches où on est seulement en
  // lecture seule). "mine" est toujours la valeur initiale, y compris
  // depuis une tuile de l'accueil (cameFromTile) : elle correspond déjà à
  // ce que la tuile a compté.
  const [scope, setScope] = useState<"mine" | "all">("mine");
  // Statut par défaut : à faire + en cours cochés (sélection multiple, un
  // bouton par statut) — reproduit le comportement d'avant la première
  // rationalisation (03/09/2026), jugé plus pratique à l'usage qu'un seul
  // bouton à bascule "tous les statuts".
  const [statuses, setStatuses] = useState<Set<TaskStatus>>(new Set(DEFAULT_STATUSES));
  const [category, setCategory] = useState<string | null>(null);
  const [dueFrom, setDueFrom] = useState(initialDueFrom ?? "");
  const [dueAtMost, setDueAtMost] = useState(initialDueAtMost ?? "");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(initialOverdueOnly ?? false);
  const [readOnlyOnly, setReadOnlyOnly] = useState(initialReadOnly ?? false);
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
    if (persisted.dueFrom !== undefined) setDueFrom(persisted.dueFrom);
    if (persisted.dueAtMost !== undefined) setDueAtMost(persisted.dueAtMost);
    if (persisted.visibility !== undefined) setVisibility(persisted.visibility);
    if (persisted.overdueOnly !== undefined) setOverdueOnly(persisted.overdueOnly);
    if (persisted.readOnlyOnly !== undefined) setReadOnlyOnly(persisted.readOnlyOnly);
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
      dueFrom,
      dueAtMost,
      visibility,
      overdueOnly,
      readOnlyOnly,
      selectedTags: Array.from(selectedTags),
      query,
    });
  }, [scope, statuses, category, dueFrom, dueAtMost, visibility, overdueOnly, readOnlyOnly, selectedTags, query]);

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
      // "Lecture seule uniquement" prime sur la portée : quand il est
      // actif, on ne garde que les tâches non modifiables, quelle que soit
      // la valeur du bouton "Uniquement mes tâches".
      if (readOnlyOnly) {
        if (canEdit(task, currentUserId)) return false;
      } else if (scope === "mine" && !canEdit(task, currentUserId)) {
        return false;
      }
      if (!statuses.has(task.status)) return false;
      if (visibility && task.visibility !== visibility) return false;
      if (category && task.category !== category) return false;
      if (selectedTags.size > 0) {
        const taskTagNames = new Set((task.tags ?? []).map((t) => t.name));
        const hasAny = Array.from(selectedTags).some((name) => taskTagNames.has(name));
        if (!hasAny) return false;
      }
      if (dueFrom || dueAtMost) {
        // Intervalle d'échéance : exclut les tâches sans échéance (rien à
        // comparer). Comparaison de chaînes "YYYY-MM-DD" = comparaison
        // chronologique, sans se soucier de l'heure exacte.
        if (!task.due_at) return false;
        const key = dateKeyFromIso(task.due_at);
        if (dueFrom && key < dueFrom) return false;
        if (dueAtMost && key > dueAtMost) return false;
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
  }, [tasks, scope, currentUserId, statuses, visibility, category, selectedTags, dueFrom, dueAtMost, overdueOnly, readOnlyOnly, query]);

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
    dueFrom.length > 0 ||
    dueAtMost.length > 0 ||
    overdueOnly ||
    readOnlyOnly ||
    query.trim().length > 0;

  const frDate = (k: string) => k.split("-").reverse().join("/");

  // Résumé texte des critères actifs, affiché sous « Filtres » quand le
  // volet est replié (demande explicite de l'utilisateur) — évite d'avoir
  // à le déplier pour se rappeler ce qui est filtré. Les statuts cochés
  // sont toujours listés ; le reste n'apparaît que s'il s'écarte du défaut.
  const checkedStatuses = STATUS_ORDER.filter((s) => statuses.has(s));
  const filterSummaryParts: string[] = [];
  if (checkedStatuses.length === 0) filterSummaryParts.push("Aucun statut");
  else if (checkedStatuses.length === STATUS_ORDER.length) filterSummaryParts.push("Tous les statuts");
  else filterSummaryParts.push(...checkedStatuses.map((s) => STATUS_LABELS[s]));
  if (readOnlyOnly) filterSummaryParts.push("Lecture seule uniquement");
  else if (scope === "all") filterSummaryParts.push("Y compris lecture seule");
  if (visibility === "shared") filterSummaryParts.push("Partagées");
  if (visibility === "private") filterSummaryParts.push("Privées");
  if (category) filterSummaryParts.push(CATEGORY_LABELS[category as Category]);
  if (dueFrom && dueAtMost)
    filterSummaryParts.push(
      dueFrom === dueAtMost
        ? `Échéance le ${frDate(dueAtMost)}`
        : `Échéance du ${frDate(dueFrom)} au ${frDate(dueAtMost)}`
    );
  else if (dueFrom) filterSummaryParts.push(`Échéance ≥ ${frDate(dueFrom)}`);
  else if (dueAtMost) filterSummaryParts.push(`Échéance ≤ ${frDate(dueAtMost)}`);
  if (overdueOnly) filterSummaryParts.push("En retard uniquement");
  for (const tag of selectedTags) filterSummaryParts.push(`#${tag}`);
  if (query.trim()) filterSummaryParts.push(`« ${query.trim()} »`);
  const filterSummary = filterSummaryParts.join(", ");

  // Remet tous les filtres à leur valeur par défaut (audit UX INC-9) —
  // utilisé par le bandeau « Filtré depuis l'accueil ».
  function resetFilters() {
    setScope("mine");
    setStatuses(new Set(DEFAULT_STATUSES));
    setCategory(null);
    setDueFrom("");
    setDueAtMost("");
    setVisibility(null);
    setOverdueOnly(false);
    setReadOnlyOnly(false);
    setSelectedTags(new Set());
    setQuery("");
    setFiltersOpen(false);
  }

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

      {/* Arrivée depuis une tuile / un lien de l'accueil : le filtrage
          courant vient de là, pas d'une session de filtrage de
          l'utilisateur — on l'explique et on offre un retour à zéro
          (audit UX INC-9). */}
      {cameFromTile && hasActiveFilters ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 px-3 py-2 text-[12px]">
          <span className="font-semibold text-ink">Filtré depuis l&apos;accueil</span>
          <button
            type="button"
            onClick={resetFilters}
            className="shrink-0 font-bold text-brand underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        </div>
      ) : null}

      {/* Volet dépliable "Filtres" : replié par défaut (voir l'état
          `filtersOpen` plus haut) pour laisser un écran plus court par
          défaut ; la barre de recherche ci-dessus reste toujours visible,
          elle n'en fait pas partie. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((prev) => !prev)}
        aria-expanded={filtersOpen}
        className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
            Filtres
            {hasActiveFilters ? (
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
            ) : null}
          </span>
          {!filtersOpen ? (
            <span className="truncate text-[12px] font-medium text-ink-muted">{filterSummary}</span>
          ) : null}
        </span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${filtersOpen ? "rotate-180" : ""}`}
        />
      </button>

      {filtersOpen ? (
        <div className="flex flex-col gap-3">
          {/* Ligne 1 : portée ("Uniquement mes tâches", coché par défaut) │
              statut (4 boutons à cocher, à faire + en cours par défaut).
              Sur mobile (`flex-col`), la portée et le groupe de statuts
              passent chacun à la ligne, sans séparateur (voir
              `FilterSeparator`) ; à partir de `sm`, ils reviennent sur la
              même ligne. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setScope((prev) => (prev === "mine" ? "all" : "mine"))}
              aria-pressed={scope === "mine"}
              className={`self-start rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                scope === "mine" ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
              }`}
            >
              Uniquement mes tâches
            </button>
            <FilterSeparator />
            {/* Statuts : sélection multiple — coche visible sur les valeurs
                actives (affordance non uniquement chromatique, cf. audit
                UX INC-5). */}
            <div role="group" aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((status) => {
                const on = statuses.has(status);
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStatus(status)}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                      on ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
                    }`}
                  >
                    {on ? <IconCheck className="h-3 w-3" /> : null}
                    {STATUS_LABELS[status]}
                  </button>
                );
              })}
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
              <span className="text-[12.5px] font-semibold text-ink-muted">Échéance</span>
              <label htmlFor="dueFrom" className="sr-only">
                À partir du
              </label>
              <input
                id="dueFrom"
                type="date"
                aria-label="Échéance à partir du"
                value={dueFrom}
                max={dueAtMost || undefined}
                onChange={(e) => setDueFrom(e.target.value)}
                className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
              />
              <span className="text-[12.5px] text-ink-muted">au</span>
              <label htmlFor="dueAtMost" className="sr-only">
                Au plus tard le
              </label>
              <input
                id="dueAtMost"
                type="date"
                aria-label="Échéance au plus tard le"
                value={dueAtMost}
                min={dueFrom || undefined}
                onChange={(e) => setDueAtMost(e.target.value)}
                className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
              />
              {dueFrom || dueAtMost ? (
                <button
                  type="button"
                  onClick={() => {
                    setDueFrom("");
                    setDueAtMost("");
                  }}
                  className="text-[12.5px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Effacer
                </button>
              ) : null}
            </div>
          </div>

          {/* Ligne 3 : partagé/privé │ en retard │ lecture seule. Même
              principe d'empilement sur mobile que les lignes 1 et 2. */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center">
            {/* Visibilité : choix unique — contrôle segmenté (un seul bloc,
                segments accolés) plutôt que des pilules séparées, pour qu'on
                voie qu'ils s'excluent (cf. audit UX INC-5). */}
            <div
              role="group"
              aria-label="Filtrer par visibilité"
              className="flex self-start overflow-hidden rounded-full border border-line text-[12.5px] font-semibold"
            >
              {(
                [
                  { value: null, label: "Toutes" },
                  { value: "shared" as Visibility, label: "Partagées" },
                  { value: "private" as Visibility, label: "Privées" },
                ] as const
              ).map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={visibility === opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className={`px-3 py-1.5 ${i > 0 ? "border-l border-line" : ""} ${
                    visibility === opt.value ? "bg-brand text-white" : "bg-surface text-ink-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <FilterSeparator />
            <button
              type="button"
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly((prev) => !prev)}
              className={`flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                overdueOnly ? "border-red-300 bg-red-50 text-red-600" : "border-line bg-surface text-ink-muted"
              }`}
            >
              <IconAlertTriangle className="h-3.5 w-3.5" /> En retard uniquement
            </button>
            {/* audit UX UX-12 : ne montrer que les tâches où l'on n'a pas
                le droit de modifier. Prime sur la portée quand il est
                actif (voir le prédicat). */}
            <button
              type="button"
              aria-pressed={readOnlyOnly}
              onClick={() => setReadOnlyOnly((prev) => !prev)}
              className={`flex items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                readOnlyOnly ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
              }`}
            >
              <IconUser className="h-3.5 w-3.5" /> Lecture seule uniquement
            </button>
          </div>

          {/* Ligne 4 : tags (sélection multiple) — un seul groupe, pas de
              séparateur ni de traitement particulier sur mobile. */}
          {tagNames.length > 0 ? (
            <div role="group" aria-label="Filtrer par tag" className="flex flex-wrap gap-1.5">
              {tagNames.map((name) => {
                const on = selectedTags.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(name)}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-semibold ${
                      on ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
                    }`}
                  >
                    {on ? <IconCheck className="h-3 w-3" /> : null}#{name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 ? (
          <EmptyState>
            {hasActiveFilters ? (
              "Aucune tâche ne correspond à ces critères."
            ) : (
              <>
                Aucune tâche ici pour le moment.
                <br />
                Appuie sur + pour en créer une.
              </>
            )}
          </EmptyState>
        ) : (
          filtered.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
