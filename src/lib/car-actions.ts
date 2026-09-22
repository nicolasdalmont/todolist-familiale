"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createCarOccurrenceTask, occurrenceDueAtIso } from "@/lib/car";
import { parseChecklistItems, syncChecklistItems } from "@/lib/checklist";
import type { Recurrence, RecurrenceType } from "@/lib/types";

// Gestion des activités récurrentes de la voiture (onglet Voiture,
// migration 005) — ouverte à tout utilisateur connecté, comme Jardin.
// Même moule que src/lib/garden-actions.ts (Server Actions "use server",
// FormData en entrée, résultat { error?, ok? }).

type Result = { error?: string; ok?: boolean };

function parseAssigneeIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("assignees").map(String).filter(Boolean))];
}

function parseRecurrence(formData: FormData): Recurrence {
  const type = String(formData.get("recurrenceType") || "none") as RecurrenceType;
  if (type === "custom") {
    const interval = Math.max(1, Number(formData.get("recurrenceInterval")) || 1);
    const unit = String(formData.get("recurrenceUnit") || "weeks") as Recurrence["unit"];
    return { type, interval, unit };
  }
  return { type };
}

function parseDueDate(formData: FormData): { dueDate: string; dayKnown: boolean } | { error: string } {
  const dayKnown = String(formData.get("dayKnown") || "true") !== "false";
  if (dayKnown) {
    const value = String(formData.get("dueDate") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Indique une date valide." };
    return { dueDate: value, dayKnown: true };
  }
  const value = String(formData.get("dueMonth") || "");
  if (!/^\d{4}-\d{2}$/.test(value)) return { error: "Indique un mois et une année valides." };
  return { dueDate: `${value}-01`, dayKnown: false };
}

function revalidate() {
  revalidatePath("/voiture");
  revalidatePath("/agendas");
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createCarActivityAction(formData: FormData): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Indique un nom pour cette activité." };
  if (name.length > 100) return { error: "Ce nom est trop long." };

  const description = String(formData.get("description") || "").trim();
  const parsedDate = parseDueDate(formData);
  if ("error" in parsedDate) return { error: parsedDate.error };
  const recurrence = parseRecurrence(formData);
  const assigneeIds = parseAssigneeIds(formData);
  if (assigneeIds.length === 0) return { error: "Sélectionne au moins un responsable." };
  const checklistLabels = parseChecklistItems(formData).map((i) => i.label);

  let activity: { id: string } | undefined;
  try {
    const rows = await sql`
      insert into car_activities (name, description, due_date, day_known, recurrence, created_by)
      values (${name}, ${description}, ${parsedDate.dueDate}, ${parsedDate.dayKnown}, ${JSON.stringify(recurrence)}, ${userId})
      returning id
    `;
    activity = rows[0] as { id: string } | undefined;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de créer l'activité." };
  }
  if (!activity) return { error: "Impossible de créer l'activité." };

  await sql`
    insert into car_activity_assignees (car_activity_id, user_id)
    select ${activity.id}, u from unnest(${assigneeIds}::uuid[]) as u
  `;

  await createCarOccurrenceTask(
    { id: activity.id, name, description, createdBy: userId, dueDate: parsedDate.dueDate, dayKnown: parsedDate.dayKnown },
    assigneeIds,
    checklistLabels
  );

  revalidate();
  return { ok: true };
}

export async function updateCarActivityAction(formData: FormData): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const activityId = String(formData.get("activityId") || "");
  if (!activityId) return { error: "Activité introuvable." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Indique un nom pour cette activité." };
  if (name.length > 100) return { error: "Ce nom est trop long." };

  const description = String(formData.get("description") || "").trim();
  const parsedDate = parseDueDate(formData);
  if ("error" in parsedDate) return { error: parsedDate.error };
  const recurrence = parseRecurrence(formData);
  const assigneeIds = parseAssigneeIds(formData);
  if (assigneeIds.length === 0) return { error: "Sélectionne au moins un responsable." };
  const checklistItems = parseChecklistItems(formData);

  const existingRows = await sql`select id, created_by from car_activities where id = ${activityId}`;
  const existing = existingRows[0] as { id: string; created_by: string } | undefined;
  if (!existing) return { error: "Activité introuvable." };

  try {
    await sql`
      update car_activities
      set name = ${name}, description = ${description}, due_date = ${parsedDate.dueDate},
          day_known = ${parsedDate.dayKnown}, recurrence = ${JSON.stringify(recurrence)}
      where id = ${activityId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de mettre à jour l'activité." };
  }

  await sql`delete from car_activity_assignees where car_activity_id = ${activityId}`;
  await sql`
    insert into car_activity_assignees (car_activity_id, user_id)
    select ${activityId}, u from unnest(${assigneeIds}::uuid[]) as u
  `;

  // Répercute directement sur la tâche ouverte associée : l'activité fait
  // autorité (même logique que updateGardenActivityAction,
  // src/lib/garden-actions.ts) — titre/description/échéance/responsables
  // sont systématiquement réécrits.
  const openTaskRows = await sql`
    select id from tasks where car_activity_id = ${activityId} and status not in ('done', 'archived')
  `;
  const openTask = openTaskRows[0] as { id: string } | undefined;
  const dueAt = occurrenceDueAtIso(parsedDate.dueDate, parsedDate.dayKnown);

  if (openTask) {
    await sql`update tasks set title = ${name}, description = ${description}, due_at = ${dueAt} where id = ${openTask.id}`;

    await sql`delete from task_assignees where task_id = ${openTask.id}`;
    const editorIds = Array.from(new Set([existing.created_by, ...assigneeIds]));
    await sql`
      insert into task_assignees (task_id, user_id, role)
      select ${openTask.id}, u, 'editor' from unnest(${editorIds}::uuid[]) as u
    `;

    await syncChecklistItems(openTask.id, checklistItems);
  } else {
    // Cas limite (pas de tâche ouverte, ex. donnée incohérente) : on en
    // recrée une plutôt que de laisser l'activité sans tâche associée.
    await createCarOccurrenceTask(
      { id: activityId, name, description, createdBy: existing.created_by, dueDate: parsedDate.dueDate, dayKnown: parsedDate.dayKnown },
      assigneeIds,
      checklistItems.map((i) => i.label)
    );
  }

  revalidate();
  return { ok: true };
}

export async function deleteCarActivityAction(activityId: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  if (!activityId) return { error: "Activité introuvable." };

  // La tâche encore ouverte est supprimée explicitement (pas de nouvelle
  // instance à générer : on arrête la récurrence) — même comportement que
  // deleteGardenActivityAction, src/lib/garden-actions.ts.
  const openTaskRows = await sql`
    select id from tasks where car_activity_id = ${activityId} and status not in ('done', 'archived')
  `;
  const openTask = openTaskRows[0] as { id: string } | undefined;
  if (openTask) {
    await sql`delete from tasks where id = ${openTask.id}`;
  }

  await sql`delete from car_activities where id = ${activityId}`;

  revalidate();
  return { ok: true };
}
