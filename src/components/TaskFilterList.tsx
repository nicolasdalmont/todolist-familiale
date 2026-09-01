"use client";

import { useMemo, useState } from "react";
import type { Tag, Task } from "@/lib/types";
import { CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { TaskCard } from "./TaskCard";
import { IconSearch } from "./Icons";

// Filtrage additionnel (catégorie / tags / mots-clefs), appliqué côté
// client par-dessus le filtre de statut déjà résolu côté serveur (voir
// src/app/page.tsx). Volontairement en mémoire : la liste de tâches d'une
// famille reste petite, et ça évite un aller-retour serveur à chaque frappe.
export function TaskFilterList({ tasks, allTags }: { tasks: Task[]; allTags: Tag[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (category && task.category !== category) return false;
      if (selectedTags.size > 0) {
        const taskTagNames = new Set((task.tags ?? []).map((t) => t.name));
        const hasAny = Array.from(selectedTags).some((name) => taskTagNames.has(name));
        if (!hasAny) return false;
      }
      if (q) {
        const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, category, selectedTags, query]);

  const hasActiveFilters = category !== null || selectedTags.size > 0 || query.trim().length > 0;

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
