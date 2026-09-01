"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/lib/actions";
import { toDatetimeLocalValue, STATUS_LABELS } from "@/lib/format";
import type { Profile, Task, TaskStatus, Visibility } from "@/lib/types";
import { IconLock, IconUsers } from "./Icons";

export function TaskForm({
  mode,
  profiles,
  currentUserId,
  task,
}: {
  mode: "create" | "edit";
  profiles: Profile[];
  currentUserId: string;
  task?: Task;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<Visibility>(task?.visibility ?? "shared");
  const [recurrenceType, setRecurrenceType] = useState(task?.recurrence?.type ?? "none");
  const assignedIds = new Set((task?.assignees ?? []).map((a) => a.id));

  const action = mode === "edit" ? updateTaskAction : createTaskAction;

  return (
    <form action={action} className="pb-6">
      {mode === "edit" && task ? <input type="hidden" name="taskId" value={task.id} /> : null}
      <input type="hidden" name="visibility" value={visibility} />

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
        <label className="mb-1.5 block text-[13px] font-bold">Visibilité</label>
        <div className="flex overflow-hidden rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setVisibility("shared")}
            className={`flex flex-1 items-center justify-center gap-1.5 border-r border-line py-2.5 text-[13.5px] font-semibold ${
              visibility === "shared" ? "bg-brand text-white" : "text-ink-muted"
            }`}
          >
            <IconUsers className="h-4 w-4" /> Partagée
          </button>
          <button
            type="button"
            onClick={() => setVisibility("private")}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[13.5px] font-semibold ${
              visibility === "private" ? "bg-brand text-white" : "text-ink-muted"
            }`}
          >
            <IconLock className="h-4 w-4" /> Privée
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Une tâche privée n&apos;est visible que par toi.</p>
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-[13px] font-bold">Assigné(e)s</label>
        <div className="flex flex-col gap-2">
          {profiles.map((p) => {
            const isCreator = p.id === currentUserId;
            const checkedByDefault = task ? assignedIds.has(p.id) : isCreator;
            return (
              <label
                key={p.id}
                className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-sm font-medium"
              >
                <input
                  type="checkbox"
                  name="assignees"
                  value={p.id}
                  defaultChecked={checkedByDefault}
                  disabled={mode === "create" && isCreator}
                  className="h-4 w-4"
                />
                {p.name}
                {mode === "create" && isCreator ? (
                  <span className="text-xs text-ink-muted">(créateur — assigné automatiquement)</span>
                ) : null}
              </label>
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
              router.push("/");
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
