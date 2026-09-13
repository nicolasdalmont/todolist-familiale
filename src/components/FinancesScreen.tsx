"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FinancesActivity, Profile, Recurrence, RecurrenceType } from "@/lib/types";
import { createFinancesActivityAction, deleteFinancesActivityAction, updateFinancesActivityAction } from "@/lib/finances-actions";
import { setStatusAction } from "@/lib/actions";
import { formatDateOnly, formatMonthYear, isDateOnlyOverdue, recurrenceLabel } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Avatar } from "@/components/Avatar";
import { IconCheck, IconChecklist, IconPencil, IconPlus, IconSearch, IconTrash } from "./Icons";

// Onglet Finances (voir migration 008 et src/lib/finances.ts) : liste des
// activités récurrentes de finances (impôts, assurances, abonnements…).
// Même montage que Voiture/Santé (SanteScreen.tsx) : chaque activité EST une
// instance datée affichée une seule fois, triée chronologiquement — sa
// clôture la remplace par l'instance suivante (nouvelle activité) plutôt
// que de la faire réapparaître le mois suivant.

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

type FormState = {
  name: string;
  description: string;
  dayKnown: boolean;
  dueDate: string; // "YYYY-MM-DD", valeur du <input type="date">
  dueMonth: string; // "YYYY-MM", valeur du <input type="month">
  recurrenceType: RecurrenceType;
  // "" pendant la frappe (champ vidé pour retaper une nouvelle valeur) —
  // voir le onChange du champ ci-dessous, jamais soumis tel quel.
  recurrenceInterval: number | "";
  recurrenceUnit: "days" | "weeks" | "months" | "years";
  assigneeIds: string[];
};

function activityToFormState(activity: FinancesActivity): FormState {
  return {
    name: activity.name,
    description: activity.description,
    dayKnown: activity.dayKnown,
    dueDate: activity.dueDate,
    dueMonth: activity.dueDate.slice(0, 7),
    recurrenceType: activity.recurrence?.type ?? "none",
    recurrenceInterval: activity.recurrence?.interval ?? 2,
    recurrenceUnit: activity.recurrence?.unit ?? "weeks",
    assigneeIds: activity.assignees.map((a) => a.id),
  };
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  dayKnown: true,
  dueDate: "",
  dueMonth: "",
  recurrenceType: "none",
  recurrenceInterval: 2,
  recurrenceUnit: "weeks",
  assigneeIds: [],
};

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
  const [state, setState] = useState<FormState>(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(state);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-[12.5px] font-bold" htmlFor="financesName">
          Nom
        </label>
        <input
          id="financesName"
          type="text"
          required
          autoFocus
          value={state.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Ex : Déclaration d'impôts, Assurance habitation…"
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-bold" htmlFor="financesDescription">
          Description
        </label>
        <textarea
          id="financesDescription"
          rows={2}
          value={state.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="block text-[12.5px] font-bold">Date</span>
          <label className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
            <input type="checkbox" checked={!state.dayKnown} onChange={(e) => set("dayKnown", !e.target.checked)} />
            Jour inconnu
          </label>
        </div>
        {state.dayKnown ? (
          <input
            type="date"
            required
            value={state.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
          />
        ) : (
          <input
            type="month"
            required
            value={state.dueMonth}
            onChange={(e) => set("dueMonth", e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
          />
        )}
      </div>
      <div>
        <label className="mb-1 block text-[12.5px] font-bold">Récurrence</label>
        <select
          value={state.recurrenceType}
          onChange={(e) => set("recurrenceType", e.target.value as RecurrenceType)}
          className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-brand"
        >
          <option value="none">Ponctuelle (pas de répétition)</option>
          <option value="daily">Quotidienne</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuelle</option>
          <option value="yearly">Annuelle</option>
          <option value="custom">Personnalisée</option>
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          À sa clôture, une activité récurrente est automatiquement remplacée par l&apos;instance suivante.
        </p>
      </div>
      {state.recurrenceType === "custom" && (
        <div>
          <label className="mb-1 block text-[12.5px] font-bold">Répéter tous les</label>
          <div className="flex gap-2.5">
            <input
              type="number"
              min={1}
              value={state.recurrenceInterval}
              onChange={(e) => {
                const raw = e.target.value;
                set("recurrenceInterval", raw === "" ? "" : Math.max(1, Math.floor(Number(raw)) || 1));
              }}
              onBlur={() => {
                if (state.recurrenceInterval === "") set("recurrenceInterval", 1);
              }}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px]"
            />
            <select
              value={state.recurrenceUnit}
              onChange={(e) => set("recurrenceUnit", e.target.value as FormState["recurrenceUnit"])}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px]"
            >
              <option value="days">jour(s)</option>
              <option value="weeks">semaine(s)</option>
              <option value="months">mois</option>
              <option value="years">an(s)</option>
            </select>
          </div>
        </div>
      )}
      <div>
        <span className="mb-1 block text-[12.5px] font-bold">Responsable(s)</span>
        <AssigneeField members={members} value={state.assigneeIds} onChange={(ids) => set("assigneeIds", ids)} />
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

function formStateToFormData(state: FormState): FormData {
  const fd = new FormData();
  fd.set("name", state.name);
  fd.set("description", state.description);
  fd.set("dayKnown", state.dayKnown ? "true" : "false");
  if (state.dayKnown) fd.set("dueDate", state.dueDate);
  else fd.set("dueMonth", state.dueMonth);
  fd.set("recurrenceType", state.recurrenceType);
  if (state.recurrenceType === "custom") {
    fd.set("recurrenceInterval", String(state.recurrenceInterval || 1));
    fd.set("recurrenceUnit", state.recurrenceUnit);
  }
  for (const id of state.assigneeIds) fd.append("assignees", id);
  return fd;
}

function matchesQuery(activity: FinancesActivity, query: string): boolean {
  if (!query) return true;
  const haystack = `${activity.name} ${activity.description}`.toLowerCase();
  return haystack.includes(query);
}

export function FinancesScreen({
  activities,
  members,
}: {
  activities: FinancesActivity[];
  members: Pick<Profile, "id" | "name" | "color">[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FinancesActivity | null>(null);

  const filtered = useMemo(
    () => activities.filter((a) => matchesQuery(a, query.trim().toLowerCase())),
    [activities, query]
  );

  // Positionnement sur la première activité à l'arrivée sur la page — liste
  // déjà triée chronologiquement par le serveur (finances-queries.ts), la
  // première entrée est donc la plus urgente (ou la plus en retard).
  const firstId = activities[0]?.id ?? null;
  const didScroll = useRef(false);
  useEffect(() => {
    if (didScroll.current || firstId === null) return;
    didScroll.current = true;
    document.getElementById(`finances-activity-${firstId}`)?.scrollIntoView({ block: "start" });
  }, [firstId]);

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
    startTransition(async () => {
      const res = await createFinancesActivityAction(formStateToFormData(state));
      if (res.error) {
        setCreateError(res.error);
        return;
      }
      setShowCreate(false);
      toast.show({ message: "Activité créée", tone: "success" });
      router.refresh();
    });
  }

  function handleUpdate(activity: FinancesActivity, state: FormState) {
    setEditError(null);
    const fd = formStateToFormData(state);
    fd.set("activityId", activity.id);
    startTransition(async () => {
      const res = await updateFinancesActivityAction(fd);
      if (res.error) {
        setEditError(res.error);
        return;
      }
      setEditingId(null);
      toast.show({ message: "Activité mise à jour", tone: "success" });
      router.refresh();
    });
  }

  function handleClose(activity: FinancesActivity) {
    if (!activity.openTask) return;
    const taskId = activity.openTask.id;
    startTransition(async () => {
      await setStatusAction(taskId, "done");
      router.refresh();
      toast.show({ message: "Activité clôturée", tone: "success" });
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
          initial={EMPTY_FORM}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitLabel="Créer l'activité"
          pending={pending}
          error={createError}
        />
      ) : null}

      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une activité..."
          className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-[14px] outline-none focus:border-brand"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-[13px] text-ink-muted">
          {activities.length === 0 ? "Aucune activité finances pour l'instant." : "Aucune activité ne correspond à la recherche."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((activity) => {
            const overdue = isDateOnlyOverdue(activity.dueDate, activity.status);
            return (
              <div key={activity.id} id={`finances-activity-${activity.id}`} className="scroll-mt-16 rounded-2xl border border-line bg-surface p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13.5px] font-bold text-ink">{activity.name}</p>
                      {overdue ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">En retard</span>
                      ) : null}
                    </div>
                    {activity.description ? <p className="text-[12.5px] text-ink-muted">{activity.description}</p> : null}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
                      <span className="font-semibold text-ink">
                        {activity.dayKnown ? formatDateOnly(activity.dueDate) : formatMonthYear(activity.dueDate)}
                      </span>
                      <span>·</span>
                      <span>{recurrenceLabel(activity.recurrence)}</span>
                    </div>
                    <div className="mt-1.5 flex -space-x-2">
                      {activity.assignees.map((a) => (
                        <Avatar key={a.id} profile={a} size="sm" className="border-2 border-surface" />
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {activity.openTask ? (
                      <>
                        <button
                          type="button"
                          aria-label="Clôturer"
                          title="Clôturer"
                          onClick={() => handleClose(activity)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-brand hover:bg-sand"
                        >
                          <IconCheck className="h-3.5 w-3.5" />
                        </button>
                        <Link
                          href={`/tasks/${activity.openTask.id}`}
                          aria-label="Voir la tâche"
                          title="Voir la tâche"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand"
                        >
                          <IconChecklist className="h-3.5 w-3.5" />
                        </Link>
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Modifier"
                      title="Modifier"
                      onClick={() => {
                        setEditError(null);
                        setEditingId(editingId === activity.id ? null : activity.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-sand"
                    >
                      <IconPencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Supprimer"
                      title="Supprimer"
                      onClick={() => setDeleting(activity)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-sand"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editingId === activity.id ? (
                  <div className="mt-3 border-t border-line-soft pt-3">
                    <ActivityForm
                      members={members}
                      initial={activityToFormState(activity)}
                      onSubmit={(state) => handleUpdate(activity, state)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Enregistrer"
                      pending={pending}
                      error={editError}
                    />
                  </div>
                ) : null}
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
          if (target) run(() => deleteFinancesActivityAction(target.id), "Activité supprimée");
        }}
      />
    </div>
  );
}
