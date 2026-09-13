import { sql } from "./db";
import { notifyUser } from "./notifications";
import { computeVisibility } from "./access";
import { parisWallTimeToUtcIso } from "./timezone";
import { computeNextOccurrence } from "./format";
import type { Recurrence } from "./types";

// Logique des activités récurrentes de finances (migration 008) — pas de
// "use server" ici : ce module n'expose aucune Server Action, il est
// importé aussi bien par src/lib/finances-actions.ts (création/modification/
// suppression d'une activité) que par src/lib/actions.ts (setStatusAction/
// deleteTaskAction, pour créer l'instance suivante quand la tâche générée
// est clôturée ou supprimée) — même montage que src/lib/health.ts.
//
// Comme Voiture/Santé (et contrairement à Jardin, un ensemble de mois porté
// par une ligne persistante), chaque activité finances EST une instance
// datée : sa clôture ne fait pas avancer un compteur sur la même ligne,
// elle crée une toute nouvelle ligne finances_activities (voir
// advanceFinancesActivity ci-dessous).

export const FINANCES_CATEGORY_SLUG = "finances";

// Échéance de la tâche générée : le jour exact à 9h Paris si connu, sinon
// le 1er du mois à 9h Paris (même convention que Voiture/Santé,
// src/lib/health.ts::occurrenceDueAtIso).
export function occurrenceDueAtIso(dueDate: string, dayKnown: boolean): string {
  const [y, m, d] = dueDate.split("-");
  const day = dayKnown ? d : "01";
  return parisWallTimeToUtcIso(`${y}-${m}-${day}T09:00`);
}

// Prochaine date ("YYYY-MM-DD") après clôture d'une occurrence — délègue à
// computeNextOccurrence() (src/lib/format.ts), déjà utilisé pour la
// récurrence générique des tâches, pour ne pas dupliquer l'arithmétique de
// dates (jours/semaines/mois/années, y compris "custom"). `null` si la
// récurrence est "none" ou invalide.
export function nextFinancesDueDate(dueDate: string, recurrence: Recurrence): string | null {
  const next = computeNextOccurrence(`${dueDate}T00:00:00.000Z`, recurrence);
  return next ? next.slice(0, 10) : null;
}

type FinancesActivitySeed = {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  dueDate: string;
  dayKnown: boolean;
};

// Crée la tâche d'une occurrence (à la création de l'activité, ou en
// créant l'instance suivante après clôture/suppression). Le créateur de
// l'activité est toujours ajouté comme éditeur (même convention que
// createHealthOccurrenceTask, src/lib/health.ts), les responsables reçoivent
// une notification s'ils ne sont pas eux-mêmes le créateur.
export async function createFinancesOccurrenceTask(activity: FinancesActivitySeed, assigneeIds: string[]): Promise<void> {
  const dueAt = occurrenceDueAtIso(activity.dueDate, activity.dayKnown);
  const visibility = computeVisibility(activity.createdBy, assigneeIds);

  const rows = await sql`
    insert into tasks (
      title, description, due_at, recurrence, category, created_by,
      finances_activity_id, visibility
    )
    values (
      ${activity.name}, ${activity.description}, ${dueAt}, ${JSON.stringify({ type: "none" })},
      ${FINANCES_CATEGORY_SLUG}, ${activity.createdBy},
      ${activity.id}, ${visibility}
    )
    returning id
  `;
  const task = rows[0] as { id: string } | undefined;
  if (!task) return;

  const editorIds = Array.from(new Set([activity.createdBy, ...assigneeIds]));
  await sql`
    insert into task_assignees (task_id, user_id, role)
    select ${task.id}, u, 'editor' from unnest(${editorIds}::uuid[]) as u
  `;

  await Promise.all(
    assigneeIds
      .filter((id) => id !== activity.createdBy)
      .map((id) =>
        notifyUser({
          userId: id,
          type: "task_shared",
          taskId: task.id,
          title: `Nouvelle tâche Finances : « ${activity.name} »`,
        })
      )
  );
}

// Clôture/suppression de la tâche générée -> clôt l'activité et, si elle
// est récurrente, crée l'instance suivante (nouvelle ligne
// finances_activities + sa tâche). Appelé depuis setStatusAction/
// deleteTaskAction (src/lib/actions.ts) quand la tâche porte un
// finances_activity_id, et directement depuis l'écran Finances pour
// clôturer une activité (via setStatusAction(task.id, "done"), qui retombe
// ici).
export async function advanceFinancesActivity(financesActivityId: string): Promise<void> {
  const rows = await sql`
    select id, name, description, to_char(due_date, 'YYYY-MM-DD') as due_date, day_known, recurrence, created_by
    from finances_activities
    where id = ${financesActivityId}
  `;
  const activity = rows[0] as
    | {
        id: string;
        name: string;
        description: string;
        due_date: string;
        day_known: boolean;
        recurrence: Recurrence;
        created_by: string;
      }
    | undefined;
  if (!activity) return;

  await sql`update finances_activities set status = 'done' where id = ${financesActivityId}`;

  if (!activity.recurrence || activity.recurrence.type === "none") return;

  const next = nextFinancesDueDate(activity.due_date, activity.recurrence);
  if (!next) return;

  const assigneeRows = await sql`select user_id from finances_activity_assignees where finances_activity_id = ${financesActivityId}`;
  const assigneeIds = (assigneeRows as { user_id: string }[]).map((r) => r.user_id);

  const newRows = await sql`
    insert into finances_activities (name, description, due_date, day_known, recurrence, created_by)
    values (${activity.name}, ${activity.description}, ${next}, ${activity.day_known}, ${JSON.stringify(activity.recurrence)}, ${activity.created_by})
    returning id
  `;
  const newActivity = newRows[0] as { id: string } | undefined;
  if (!newActivity) return;

  if (assigneeIds.length > 0) {
    await sql`
      insert into finances_activity_assignees (finances_activity_id, user_id)
      select ${newActivity.id}, u from unnest(${assigneeIds}::uuid[]) as u
    `;
  }

  await createFinancesOccurrenceTask(
    {
      id: newActivity.id,
      name: activity.name,
      description: activity.description,
      createdBy: activity.created_by,
      dueDate: next,
      dayKnown: activity.day_known,
    },
    assigneeIds
  );
}
