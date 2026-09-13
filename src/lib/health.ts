import { sql } from "./db";
import { notifyUser } from "./notifications";
import { computeVisibility } from "./access";
import { parisWallTimeToUtcIso } from "./timezone";
import { computeNextOccurrence } from "./format";
import type { Recurrence } from "./types";

// Logique des activités récurrentes de santé (migration 007) — pas de
// "use server" ici : ce module n'expose aucune Server Action, il est
// importé aussi bien par src/lib/health-actions.ts (création/modification/
// suppression d'une activité) que par src/lib/actions.ts (setStatusAction/
// deleteTaskAction, pour créer l'instance suivante quand la tâche générée
// est clôturée ou supprimée) — même montage que src/lib/car.ts.
//
// Comme Voiture (et contrairement à Jardin, un ensemble de mois porté par
// une ligne persistante), chaque activité santé EST une instance datée :
// sa clôture ne fait pas avancer un compteur sur la même ligne, elle crée
// une toute nouvelle ligne health_activities (voir advanceHealthActivity
// ci-dessous).

export const HEALTH_CATEGORY_SLUG = "sante";

// Échéance de la tâche générée : le jour exact à 9h Paris si connu, sinon
// le 1er du mois à 9h Paris (même convention que Voiture,
// src/lib/car.ts::occurrenceDueAtIso).
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
export function nextHealthDueDate(dueDate: string, recurrence: Recurrence): string | null {
  const next = computeNextOccurrence(`${dueDate}T00:00:00.000Z`, recurrence);
  return next ? next.slice(0, 10) : null;
}

type HealthActivitySeed = {
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
// createCarOccurrenceTask, src/lib/car.ts), les responsables reçoivent une
// notification s'ils ne sont pas eux-mêmes le créateur.
export async function createHealthOccurrenceTask(activity: HealthActivitySeed, assigneeIds: string[]): Promise<void> {
  const dueAt = occurrenceDueAtIso(activity.dueDate, activity.dayKnown);
  const visibility = computeVisibility(activity.createdBy, assigneeIds);

  const rows = await sql`
    insert into tasks (
      title, description, due_at, recurrence, category, created_by,
      health_activity_id, visibility
    )
    values (
      ${activity.name}, ${activity.description}, ${dueAt}, ${JSON.stringify({ type: "none" })},
      ${HEALTH_CATEGORY_SLUG}, ${activity.createdBy},
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
          title: `Nouvelle tâche Santé : « ${activity.name} »`,
        })
      )
  );
}

// Clôture/suppression de la tâche générée -> clôt l'activité et, si elle
// est récurrente, crée l'instance suivante (nouvelle ligne
// health_activities + sa tâche). Appelé depuis setStatusAction/
// deleteTaskAction (src/lib/actions.ts) quand la tâche porte un
// health_activity_id, et directement depuis l'écran Santé pour clôturer
// une activité (via setStatusAction(task.id, "done"), qui retombe ici).
export async function advanceHealthActivity(healthActivityId: string): Promise<void> {
  const rows = await sql`
    select id, name, description, to_char(due_date, 'YYYY-MM-DD') as due_date, day_known, recurrence, created_by
    from health_activities
    where id = ${healthActivityId}
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

  await sql`update health_activities set status = 'done' where id = ${healthActivityId}`;

  if (!activity.recurrence || activity.recurrence.type === "none") return;

  const next = nextHealthDueDate(activity.due_date, activity.recurrence);
  if (!next) return;

  const assigneeRows = await sql`select user_id from health_activity_assignees where health_activity_id = ${healthActivityId}`;
  const assigneeIds = (assigneeRows as { user_id: string }[]).map((r) => r.user_id);

  const newRows = await sql`
    insert into health_activities (name, description, due_date, day_known, recurrence, created_by)
    values (${activity.name}, ${activity.description}, ${next}, ${activity.day_known}, ${JSON.stringify(activity.recurrence)}, ${activity.created_by})
    returning id
  `;
  const newActivity = newRows[0] as { id: string } | undefined;
  if (!newActivity) return;

  if (assigneeIds.length > 0) {
    await sql`
      insert into health_activity_assignees (health_activity_id, user_id)
      select ${newActivity.id}, u from unnest(${assigneeIds}::uuid[]) as u
    `;
  }

  await createHealthOccurrenceTask(
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
