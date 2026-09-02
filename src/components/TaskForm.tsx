"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/lib/actions";
import { toDatetimeLocalValue, STATUS_LABELS } from "@/lib/format";
import { CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_ORDER, DEFAULT_CATEGORY } from "@/lib/categories";
import type { Profile, ShareRole, Tag, Task, TaskStatus } from "@/lib/types";
import { IconPlus } from "./Icons";

// Les trois niveaux d'accès proposés pour chaque membre de la famille
// (hors créateur, qui a toujours accès complet — voir src/lib/access.ts).
const SHARE_OPTIONS: { value: "none" | ShareRole; label: string }[] = [
  { value: "none", label: "Aucun accès" },
  { value: "viewer", label: "Lecture seule" },
  { value: "editor", label: "Assigné(e)" },
];

export function TaskForm({
  mode,
  profiles,
  allTags,
  currentUserId,
  task,
}: {
  mode: "create" | "edit";
  profiles: Profile[];
  allTags: Tag[];
  currentUserId: string;
  task?: Task;
}) {
  const router = useRouter();
  const [recurrenceType, setRecurrenceType] = useState(task?.recurrence?.type ?? "none");
  const [category, setCategory] = useState(task?.category ?? DEFAULT_CATEGORY);
  const [tagOptions, setTagOptions] = useState(() => allTags.map((t) => t.name).sort((a, b) => a.localeCompare(b)));
  const [selectedTags, setSelectedTags] = useState(() => new Set((task?.tags ?? []).map((t) => t.name)));
  const [newTag, setNewTag] = useState("");

  // Le créateur (celui qui crée la tâche, ou son créateur d'origine en
  // modification) a toujours un accès complet et n'apparaît pas dans la
  // liste de partage ci-dessous — imposé côté serveur de toute façon.
  const creatorId = mode === "edit" && task ? task.created_by : currentUserId;
  const shareable = profiles.filter((p) => p.id !== creatorId);
  const [shareRoles, setShareRoles] = useState<Record<string, "none" | ShareRole>>(() => {
    const initial: Record<string, "none" | ShareRole> = {};
    for (const p of shareable) {
      const existing = task?.assignees?.find((a) => a.id === p.id);
      initial[p.id] = existing?.role ?? "none";
    }
    return initial;
  });

  const action = mode === "edit" ? updateTaskAction : createTaskAction;

  function toggleTag(name: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addNewTag() {
    const name = newTag.trim().toLowerCase();
    if (!name) return;
    if (!tagOptions.includes(name)) {
      setTagOptions((prev) => [...prev, name].sort((a, b) => a.localeCompare(b)));
    }
    setSelectedTags((prev) => new Set(prev).add(name));
    setNewTag("");
  }

  return (
    <form action={action} className="pb-6">
      {mode === "edit" && task ? <input type="hidden" name="taskId" value={task.id} /> : null}
      <input type="hidden" name="category" value={category} />

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold" htmlFor="title">
          Titre
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={task?.title}
          placeholder="Ex : Courses de la semaine"
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={task?.description}
          placeholder="Détails, liste, instructions..."
          className="min-h-[90px] w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold" htmlFor="dueAt">
          Échéance
        </label>
        <input
          id="dueAt"
          name="dueAt"
          type="datetime-local"
          defaultValue={task ? toDatetimeLocalValue(task.due_at) : ""}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold">Catégorie</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                  category === c ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold">Récurrence</label>
        <select
          name="recurrenceType"
          value={recurrenceType}
          onChange={(e) => setRecurrenceType(e.target.value as typeof recurrenceType)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px] outline-none focus:border-brand"
        >
          <option value="none">Ponctuelle (pas de répétition)</option>
          <option value="daily">Quotidienne</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuelle</option>
          <option value="custom">Personnalisée</option>
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          La tâche sera régénérée automatiquement à sa clôture si elle est récurrente.
        </p>
      </div>

      {recurrenceType === "custom" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-bold">Répéter tous les</label>
          <div className="flex gap-2.5">
            <input
              type="number"
              name="recurrenceInterval"
              min={1}
              defaultValue={task?.recurrence?.interval ?? 2}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px]"
            />
            <select
              name="recurrenceUnit"
              defaultValue={task?.recurrence?.unit ?? "weeks"}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px]"
            >
              <option value="days">jour(s)</option>
              <option value="weeks">semaine(s)</option>
              <option value="months">mois</option>
            </select>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold">Tags</label>
        <div className="flex flex-wrap gap-1.5">
          {tagOptions.map((name) => (
            <label key={name} className="cursor-pointer">
              <input
                type="checkbox"
                name="tags"
                value={name}
                checked={selectedTags.has(name)}
                onChange={() => toggleTag(name)}
                className="peer sr-only"
              />
              <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white">
                #{name}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNewTag();
              }
            }}
            placeholder="Nouveau tag..."
            className="flex-1 rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={addNewTag}
            className="flex items-center gap-1 rounded-xl border border-line bg-surface px-3 text-[12.5px] font-bold text-ink-muted"
          >
            <IconPlus className="h-3.5 w-3.5" /> Ajouter
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold">Partager avec</label>
        <p className="mb-2 text-xs text-ink-muted">
          Une tâche est privée par défaut (visible seulement par toi). Choisis pour chaque personne si elle peut
          juste la voir (et commenter) ou aussi la modifier.
        </p>
        <div className="flex flex-col gap-2">
          {shareable.map((p) => {
            const role = shareRoles[p.id] ?? "none";
            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-2.5 py-2"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <div className="flex overflow-hidden rounded-lg border border-line text-[11.5px] font-bold">
                  {SHARE_OPTIONS.map((opt, i) => (
                    <label key={opt.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`role-${p.id}`}
                        value={opt.value}
                        checked={role === opt.value}
                        onChange={() => setShareRoles((prev) => ({ ...prev, [p.id]: opt.value }))}
                        className="peer sr-only"
                      />
                      <span
                        className={`inline-flex items-center px-2.5 py-1.5 ${i > 0 ? "border-l border-line" : ""} ${
                          role === opt.value ? "bg-brand text-white" : "bg-surface text-ink-muted"
                        }`}
                      >
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {mode === "edit" && task ? (
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-bold" htmlFor="status">
            Statut
          </label>
          <select
            id="status"
            name="status"
            defaultValue={task.status}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-[14.5px]"
          >
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5">
        <button type="submit" className="w-full rounded-xl bg-brand py-3 text-[14.5px] font-bold text-white">
          {mode === "edit" ? "Enregistrer" : "Créer la tâche"}
        </button>

        {mode === "edit" && task ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("Supprimer définitivement cette tâche ?")) return;
              const formData = new FormData();
              formData.set("taskId", task.id);
              await deleteTaskAction(formData);
              router.push("/tasks");
            }}
            className="w-full rounded-xl bg-rose-50 py-3 text-[14.5px] font-bold text-rose-600"
          >
            Supprimer la tâche
          </button>
        ) : null}
      </div>
    </form>
  );
}
