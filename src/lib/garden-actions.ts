"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { createGardenOccurrenceTask, currentParisYearMonth, nextGardenOccurrence, occurrenceDueAtIso } from "@/lib/garden";
import { FALLBACK_GARDEN_CATEGORY_SLUG } from "@/lib/garden-categories";
import { parseChecklistItems, syncChecklistItems } from "@/lib/checklist";

// Gestion des activités récurrentes du jardin (onglet Jardin, migration
// 003) — ouverte à tout utilisateur connecté, pas réservée à l'admin
// (contrairement aux catégories) : au même titre que les tâches, c'est de
// l'organisation familiale courante. Même moule que src/lib/actions.ts
// (Server Actions "use server", FormData en entrée, résultat { error?, ok? }).

type Result = { error?: string; ok?: boolean };

function parseMonths(formData: FormData): number[] {
  return [...new Set(formData.getAll("months").map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))];
}

function parseAssigneeIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("assignees").map(String).filter(Boolean))];
}

// Valide le slug de catégorie soumis contre garden_activity_categories —
// repli sur « autre » si absent, même logique que resolveCategorySlug()
// dans src/lib/actions.ts (catégories de tâches).
async function resolveGardenCategorySlug(raw: string): Promise<string> {
  const slug = raw.trim();
  if (!slug) return FALLBACK_GARDEN_CATEGORY_SLUG;
  try {
    const rows = await sql`select slug from garden_activity_categories where slug = ${slug}`;
    return rows[0] ? slug : FALLBACK_GARDEN_CATEGORY_SLUG;
  } catch {
    return slug;
  }
}

function revalidate() {
  revalidatePath("/jardin");
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function createGardenActivityAction(formData: FormData): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Indique un nom pour cette activité." };
  if (name.length > 100) return { error: "Ce nom est trop long." };

  const description = String(formData.get("description") || "").trim();
  const months = parseMonths(formData);
  if (months.length === 0) return { error: "Sélectionne au moins un mois." };
  const assigneeIds = parseAssigneeIds(formData);
  if (assigneeIds.length === 0) return { error: "Sélectionne au moins un responsable." };
  const category = await resolveGardenCategorySlug(String(formData.get("category") || ""));
  const checklistLabels = parseChecklistItems(formData).map((i) => i.label);

  let activity: { id: string } | undefined;
  try {
    const rows = await sql`
      insert into garden_activities (name, description, months, category, created_by)
      values (${name}, ${description}, ${months}, ${category}, ${userId})
      returning id
    `;
    activity = rows[0] as { id: string } | undefined;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de créer l'activité." };
  }
  if (!activity) return { error: "Impossible de créer l'activité." };

  await sql`
    insert into garden_activity_assignees (garden_activity_id, user_id)
    select ${activity.id}, u from unnest(${assigneeIds}::uuid[]) as u
  `;

  const { year, month } = currentParisYearMonth();
  const next = nextGardenOccurrence(months, year, month, false);
  await createGardenOccurrenceTask(
    { id: activity.id, name, description, createdBy: userId },
    assigneeIds,
    next.year,
    next.month,
    checklistLabels
  );

  revalidate();
  return { ok: true };
}

export async function updateGardenActivityAction(formData: FormData): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const activityId = String(formData.get("activityId") || "");
  if (!activityId) return { error: "Activité introuvable." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Indique un nom pour cette activité." };
  if (name.length > 100) return { error: "Ce nom est trop long." };

  const description = String(formData.get("description") || "").trim();
  const months = parseMonths(formData);
  if (months.length === 0) return { error: "Sélectionne au moins un mois." };
  const assigneeIds = parseAssigneeIds(formData);
  if (assigneeIds.length === 0) return { error: "Sélectionne au moins un responsable." };
  const category = await resolveGardenCategorySlug(String(formData.get("category") || ""));
  const checklistItems = parseChecklistItems(formData);

  const existingRows = await sql`select id, created_by from garden_activities where id = ${activityId}`;
  const existing = existingRows[0] as { id: string; created_by: string } | undefined;
  if (!existing) return { error: "Activité introuvable." };

  try {
    await sql`
      update garden_activities
      set name = ${name}, description = ${description}, months = ${months}, category = ${category}
      where id = ${activityId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Impossible de mettre à jour l'activité." };
  }

  await sql`delete from garden_activity_assignees where garden_activity_id = ${activityId}`;
  await sql`
    insert into garden_activity_assignees (garden_activity_id, user_id)
    select ${activityId}, u from unnest(${assigneeIds}::uuid[]) as u
  `;

  // Répercute directement sur la tâche ouverte associée : l'activité fait
  // autorité, titre/description/responsables sont systématiquement
  // réécrits (y compris si la tâche avait été modifiée entre-temps à la
  // main). L'échéance n'est recalculée que si le mois de l'occurrence en
  // cours n'appartient plus aux nouvelles périodes — sinon elle reste celle
  // déjà fixée.
  const openTaskRows = await sql`
    select id, garden_occurrence_month, garden_occurrence_year
    from tasks
    where garden_activity_id = ${activityId} and status not in ('done', 'archived')
  `;
  const openTask = openTaskRows[0] as
    | { id: string; garden_occurrence_month: number; garden_occurrence_year: number }
    | undefined;

  if (openTask) {
    let occMonth = openTask.garden_occurrence_month;
    let occYear = openTask.garden_occurrence_year;
    if (!months.includes(occMonth)) {
      const { year, month } = currentParisYearMonth();
      const next = nextGardenOccurrence(months, year, month, false);
      occMonth = next.month;
      occYear = next.year;
    }
    const dueAt = occurrenceDueAtIso(occYear, occMonth);

    await sql`
      update tasks
      set title = ${name}, description = ${description}, due_at = ${dueAt},
          garden_occurrence_month = ${occMonth}, garden_occurrence_year = ${occYear}
      where id = ${openTask.id}
    `;

    await sql`delete from task_assignees where task_id = ${openTask.id}`;
    const editorIds = Array.from(new Set([existing.created_by, ...assigneeIds]));
    await sql`
      insert into task_assignees (task_id, user_id, role)
      select ${openTask.id}, u, 'editor' from unnest(${editorIds}::uuid[]) as u
    `;

    await syncChecklistItems(openTask.id, checklistItems);
  } else {
    // Cas limite (pas de tâche ouverte, ex. donnée incohérente) : on en
    // recrée une pour la prochaine période plutôt que de laisser
    // l'activité sans tâche associée.
    const { year, month } = currentParisYearMonth();
    const next = nextGardenOccurrence(months, year, month, false);
    await createGardenOccurrenceTask(
      { id: activityId, name, description, createdBy: existing.created_by },
      assigneeIds,
      next.year,
      next.month,
      checklistItems.map((i) => i.label)
    );
  }

  revalidate();
  return { ok: true };
}

export async function deleteGardenActivityAction(activityId: string): Promise<Result> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  if (!activityId) return { error: "Activité introuvable." };

  // La tâche encore ouverte est supprimée explicitement (pas de nouvelle
  // occurrence à générer : on arrête la récurrence) ; une tâche déjà
  // clôturée reste dans l'historique (FK "on delete set null").
  const openTaskRows = await sql`
    select id from tasks where garden_activity_id = ${activityId} and status not in ('done', 'archived')
  `;
  const openTask = openTaskRows[0] as { id: string } | undefined;
  if (openTask) {
    await sql`delete from tasks where id = ${openTask.id}`;
  }

  await sql`delete from garden_activities where id = ${activityId}`;

  revalidate();
  return { ok: true };
}
