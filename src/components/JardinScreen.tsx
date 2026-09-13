"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GardenActivity, Profile } from "@/lib/types";
import { createGardenActivityAction, deleteGardenActivityAction, updateGardenActivityAction } from "@/lib/garden-actions";
import { formatDateOnly } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/Avatar";
import { IconLeaf, IconPencil, IconPlus } from "./Icons";

// Onglet Jardin (voir migration 003 et src/lib/garden.ts) : liste des
// activités récurrentes du jardin (taille, tonte, semis, plantation…),
// affichées une fois par mois concerné (une activité biannuelle apparaît
// donc deux fois, mais reste la même activité — les actions modifier/
// supprimer portent toujours sur l'activité entière, jamais sur une seule
// occurrence). Même moule de formulaire que RewardManager.tsx/
// CategoryManager.tsx (src/components/).

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MONTH_SHORT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

type Occurrence = { key: string; month: number; activity: GardenActivity };

function buildOccurrences(activities: GardenActivity[]): Occurrence[][] {
  const buckets: Occurrence[][] = Array.from({ length: 12 }, () => []);
  for (const activity of activities) {
    for (const month of activity.months) {
      buckets[month - 1].push({ key: `${activity.id}:${month}`, month, activity });
    }
  }
  return buckets;
}

// Mois d'ancrage à l'arrivée sur la page : le mois courant s'il porte au
// moins une activité, sinon le prochain mois qui en porte une (en
// bouclant sur l'année suivante) — sinon aucun (liste vide).
function anchorMonth(buckets: Occurrence[][], currentMonth: number): number | null {
  for (let i = 0; i < 12; i++) {
    const m = ((currentMonth - 1 + i) % 12) + 1;
    if (buckets[m - 1].length > 0) return m;
  }
  return null;
}

function MonthField({ value, onChange }: { value: number[]; onChange: (months: number[]) => void }) {
  function toggle(m: number) {
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => a - b));
  }
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {MONTH_SHORT.map((label, i) => {
        const m = i + 1;
        const active = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(m)}
            className={`rounded-lg border py-1.5 text-[12.5px] font-semibold ${
              active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AssigneeField({
  members,
  value,
  onChange,
}: {
  members: Pick<Profile, "id" | "name" | "color">[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map((m) => {
        const active = value.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(m.id)}
            className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-[12.5px] font-semibold ${
              active ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface text-ink-muted"
            }`}
          >
            <Avatar profile={m} size="sm" />
            {m.name}
          </button>
        );
      })}
    </div>
  );
}

type FormState = { name: string; description: string; months: number[]; assigneeIds: string[] };

function ActivityForm({
  members,
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  pending,
  error,
}: {
  members: Pick<Profile, "id" | "name" | "color">[];
  initial: FormState;
  onSubmit: (state: FormState) => void;
  onCancel: () => void;
  submitLabel: string;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [months, setMonths] = useState<number[]>(initial.months);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial.assigneeIds);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ name, description, months, assigneeIds });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-[12.5px] font-bold" htmlFor="gardenName">
          Nom
        </label>
        <input
          id="gardenName"
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Taille des hortensias"
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-bold" htmlFor="gardenDescription">
          Description
        </label>
        <textarea
          id="gardenDescription"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        />
      </div>
      <div>
        <span className="mb-1 block text-[12.5px] font-bold">Période(s)</span>
        <MonthField value={months} onChange={setMonths} />
      </div>
      <div>
        <span className="mb-1 block text-[12.5px] font-bold">Responsable(s)</span>
        <AssigneeField members={members} value={assigneeIds} onChange={setAssigneeIds} />
      </div>
      {error ? <p className="text-[12.5px] font-semibold text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-xl bg-brand py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line bg-surface px-4 py-2.5 text-[13.5px] font-bold text-ink-muted"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

export function JardinScreen({
  activities,
  members,
  currentMonth,
}: {
  activities: GardenActivity[];
  members: Pick<Profile, "id" | "name" | "color">[];
  currentMonth: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GardenActivity | null>(null);

  const buckets = buildOccurrences(activities);
  const anchor = anchorMonth(buckets, currentMonth);
  const didScroll = useRef(false);

  useEffect(() => {
    if (didScroll.current || anchor === null) return;
    didScroll.current = true;
    document.getElementById(`month-${anchor}`)?.scrollIntoView({ block: "start" });
  }, [anchor]);

  function run(action: () => Promise<{ error?: string; ok?: boolean }>, okMessage: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      onOk?.();
      toast.show({ message: okMessage, tone: "success" });
      router.refresh();
    });
  }

  function handleCreate(state: FormState) {
    setCreateError(null);
    const fd = new FormData();
    fd.set("name", state.name);
    fd.set("description", state.description);
    for (const m of state.months) fd.append("months", String(m));
    for (const id of state.assigneeIds) fd.append("assignees", id);
    startTransition(async () => {
      const res = await createGardenActivityAction(fd);
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setShowCreate(false);
      toast.show({ message: "Activité créée", tone: "success" });
      router.refresh();
    });
  }

  function handleUpdate(activity: GardenActivity, state: FormState) {
    setEditError(null);
    const fd = new FormData();
    fd.set("activityId", activity.id);
    fd.set("name", state.name);
    fd.set("description", state.description);
    for (const m of state.months) fd.append("months", String(m));
    for (const id of state.assigneeIds) fd.append("assignees", id);
    startTransition(async () => {
      const res = await updateGardenActivityAction(fd);
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditingKey(null);
      toast.show({ message: "Activité mise à jour", tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">
          {activities.length} activité{activities.length > 1 ? "s" : ""}
        </p>
        {!showCreate ? (
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreate(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-white"
          >
            <IconPlus className="h-3.5 w-3.5" /> Nouvelle activité
          </button>
        ) : null}
      </div>

      {showCreate ? (
        <ActivityForm
          members={members}
          initial={{ name: "", description: "", months: [], assigneeIds: [] }}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitLabel="Créer l'activité"
          pending={pending}
          error={createError}
        />
      ) : null}

      {/* Accès direct à un mois — défile la liste jusqu'à sa section, même
          vide (pratique pour aller y créer une activité). */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1">
          {MONTH_SHORT.map((label, i) => {
            const m = i + 1;
            const hasActivities = buckets[m - 1].length > 0;
            return (
              <button
                key={m}
                type="button"
                onClick={() => document.getElementById(`month-${m}`)?.scrollIntoView({ block: "start" })}
                className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${
                  m === currentMonth
                    ? "bg-brand text-white"
                    : hasActivities
                      ? "bg-brand-soft text-brand-dark"
                      : "text-ink-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {activities.length === 0 && !showCreate ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-[13px] text-ink-muted">
          Aucune activité de jardin pour l&apos;instant.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {MONTH_NAMES.map((label, i) => {
            const m = i + 1;
            const occurrences = buckets[i];
            return (
              <div key={m} id={`month-${m}`} className="scroll-mt-16">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold text-ink-muted">
                  {label}
                  {m === currentMonth ? <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10.5px] text-brand-dark">En cours</span> : null}
                </h3>
                {occurrences.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line-soft p-3 text-center text-[12.5px] text-ink-muted">
                    Aucune activité ce mois-ci.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {occurrences.map(({ key, activity }) => (
                      <div key={key} className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                              <IconLeaf className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-bold text-ink">{activity.name}</p>
                              {activity.description ? (
                                <p className="text-[12.5px] text-ink-muted">{activity.description}</p>
                              ) : null}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {activity.assignees.map((a) => (
                                  <Avatar key={a.id} profile={a} size="sm" />
                                ))}
                                {activity.openTask?.due_at ? (
                                  <span className="text-[11.5px] text-ink-muted">
                                    Échéance : {formatDateOnly(activity.openTask.due_at)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {activity.openTask ? (
                              <Link
                                href={`/tasks/${activity.openTask.id}`}
                                className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline"
                              >
                                Voir la tâche
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              aria-label="Modifier"
                              onClick={() => {
                                setEditError(null);
                                setEditingKey(editingKey === key ? null : key);
                              }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand"
                            >
                              <IconPencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(activity)}
                              className="text-[12px] font-semibold text-red-600 underline-offset-2 hover:underline"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>

                        {editingKey === key ? (
                          <div className="mt-3 border-t border-line-soft pt-3">
                            <ActivityForm
                              members={members}
                              initial={{
                                name: activity.name,
                                description: activity.description,
                                months: activity.months,
                                assigneeIds: activity.assignees.map((a) => a.id),
                              }}
                              onSubmit={(state) => handleUpdate(activity, state)}
                              onCancel={() => setEditingKey(null)}
                              submitLabel="Enregistrer"
                              pending={pending}
                              error={editError}
                            />
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Supprimer « ${deleting.name} » ?` : ""}
        body="La tâche en cours associée sera aussi supprimée. Cette activité ne générera plus de tâche."
        confirmLabel="Supprimer"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) run(() => deleteGardenActivityAction(target.id), "Activité supprimée");
        }}
      />
    </div>
  );
}
